// Builds the web app for the Android/iOS apps and copies it into the native projects.
//
//   npm run mobile:sync                                   API on this PC at http://localhost:5004
//   npm run mobile:sync -- --api https://gym.example.com  a hosted API (--api=<url> works too)
//   npm run mobile:sync -- --lan                          API on this PC, reached over the local network
//
// By default nothing has to listen on the network: `npm run mobile:run` points the emulator's or USB
// phone's localhost:5004 at this PC with `adb reverse`, and the iOS simulator shares the Mac's localhost.
// PULSEFIT_API_URL works in place of --api. The address is remembered in client/.mobile-api-url so
// that capacitor.config.ts sets up the native projects for it on every later `npx cap ...` command.
import { spawnSync } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_API = 'http://localhost:5004';
const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|VMnet|TAP|Tailscale|ZeroTier|Docker|Loopback/i;
const USAGE = 'Usage: npm run mobile:sync [-- --api <url> | --lan]';

const fail = message => {
  console.error(message);
  process.exit(1);
};

function parseArgs(argv) {
  let api;
  let lan = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--api') {
      api = argv[++i];
      if (!api || api.startsWith('--')) fail('--api needs a server address, e.g. --api https://gym.example.com');
    } else if (arg.startsWith('--api=')) {
      api = arg.slice('--api='.length);
      if (!api) fail('--api needs a server address, e.g. --api=https://gym.example.com');
    } else if (arg === '--lan') {
      lan = true;
    } else {
      fail(`Unknown option "${arg}". ${USAGE}`);
    }
  }
  if (api && lan) fail(`Use either --api or --lan, not both. ${USAGE}`);
  return { api, lan };
}

// The address the OS would use to reach the internet, i.e. the Wi-Fi/Ethernet adapter rather than
// a virtual one. Connecting a UDP socket sends nothing.
const routedAddress = () =>
  new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    socket.on('error', () => {
      socket.close();
      resolve(undefined);
    });
    socket.connect(53, '8.8.8.8', () => {
      const { address } = socket.address();
      socket.close();
      resolve(PRIVATE_IPV4.test(address) ? address : undefined);
    });
  });

function physicalAddresses() {
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !VIRTUAL_ADAPTER.test(name))
    .flatMap(([, list]) => list ?? [])
    .filter(a => a.family === 'IPv4' && !a.internal && PRIVATE_IPV4.test(a.address))
    .map(a => a.address);
}

const { api, lan } = parseArgs(process.argv.slice(2));
let apiUrl = api || process.env.PULSEFIT_API_URL || LOCAL_API;
if (lan) {
  const ip = (await routedAddress()) ?? physicalAddresses()[0];
  if (!ip) fail('No local network address found. Connect to Wi-Fi, or drop --lan to use adb reverse.');
  apiUrl = `http://${ip}:5004`;
}
apiUrl = apiUrl.replace(/\/+$/, '');
if (!/^https?:\/\/[^/\s]+$/.test(apiUrl)) {
  fail(`"${apiUrl}" is not a server address like https://gym.example.com or http://localhost:5004.`);
}

console.log(`📱 Building the app against ${apiUrl}`);
if (lan) {
  console.warn('⚠️  LAN mode: anyone on this network can reach the dev API and sign in as the demo admin.');
  console.warn('   Start the API with HOST=0.0.0.0 (PowerShell: $env:HOST="0.0.0.0"; npm run dev), only on a');
  console.warn('   network you trust, and stop it when you are done. Without --lan, nothing listens on the network.');
} else if (apiUrl === LOCAL_API) {
  console.log('   `npm run mobile:run` connects the emulator or USB phone to it with `adb reverse`.');
} else if (apiUrl.startsWith('http://')) {
  console.log('   Plain http: fine for local testing, not for a store release.');
}

const env = { ...process.env, VITE_API_URL: apiUrl };
// One command string: passing args together with shell: true is deprecated (DEP0190).
const run = command => {
  const result = spawnSync(command, { stdio: 'inherit', shell: true, env, cwd: clientDir });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('npx vite build --outDir dist-mobile --emptyOutDir');
fs.writeFileSync(path.join(clientDir, '.mobile-api-url'), `${apiUrl}\n`);
run('npx cap sync');
