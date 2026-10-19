// Builds the Android debug APK and installs + starts it on a connected phone or emulator.
// Starts the first Android emulator (AVD) when nothing is connected. Run `npm run mobile:sync` first.
// When the app was built against http://localhost:<port>, runs `adb reverse` so the device reaches
// the API on this PC over adb, without the API listening on the network.
//
//   npm run mobile:run                     first connected device, else boot an emulator
//   npm run mobile:run -- --device <id>    a specific device from `adb devices`
//
// Needs JAVA_HOME (JDK 21) and ANDROID_HOME (Android SDK). Replaces `cap run android`, whose
// `./gradlew` call fails on Windows.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'com.pulsefit.app';
const isWindows = process.platform === 'win32';
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(clientDir, 'android');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const fail = message => {
  console.error(message);
  process.exit(1);
};

if (!sdk) fail('ANDROID_HOME is not set. Point it at your Android SDK (see README › Android & iOS Apps).');
const adb = path.join(sdk, 'platform-tools', isWindows ? 'adb.exe' : 'adb');
const emulator = path.join(sdk, 'emulator', isWindows ? 'emulator.exe' : 'emulator');
if (!fs.existsSync(adb)) fail(`adb not found at ${adb}. Install the Android SDK platform-tools.`);
if (!fs.existsSync(path.join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'index.html'))) {
  fail('The app has not been built yet. Run `npm run mobile:sync` first.');
}

const deviceArg = process.argv.indexOf('--device');
let device = deviceArg > -1 ? process.argv[deviceArg + 1] : undefined;
if (deviceArg > -1 && !device) fail('--device needs an id from `adb devices`.');

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const devices = () =>
  sh(adb, ['devices']).stdout
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(([id, state]) => id && state === 'device')
    .map(([id]) => id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('🔨 Building the debug APK...');
// Full path: some Windows setups (NoDefaultCurrentDirectoryInExePath) never run a bare gradlew.bat.
const gradle = isWindows
  ? spawnSync(`"${path.join(androidDir, 'gradlew.bat')}" assembleDebug`, { cwd: androidDir, stdio: 'inherit', shell: true })
  : sh(path.join(androidDir, 'gradlew'), ['assembleDebug'], { cwd: androidDir, stdio: 'inherit' });
if (gradle.status !== 0) fail('Gradle build failed (see above). Check that JAVA_HOME points to a JDK 21.');
const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

if (!device) {
  device = devices()[0];
  if (!device) {
    const avd = fs.existsSync(emulator) ? sh(emulator, ['-list-avds']).stdout.split(/\r?\n/).find(Boolean) : undefined;
    if (!avd) fail('No phone or emulator connected, and no emulator (AVD) to start. Plug in a phone with USB debugging on.');
    console.log(`📱 Starting the ${avd} emulator...`);
    spawn(emulator, ['-avd', avd, '-no-boot-anim'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 90 && !device; i++) {
      await sleep(2000);
      device = devices()[0];
    }
    if (!device) fail('The emulator did not come up in 3 minutes.');
  }
}
for (let i = 0; i < 90; i++) {
  if (sh(adb, ['-s', device, 'shell', 'getprop', 'sys.boot_completed']).stdout.trim() === '1') break;
  await sleep(2000);
}

// Written by mobile-sync.mjs.
const apiUrl = (() => {
  try {
    return fs.readFileSync(path.join(clientDir, '.mobile-api-url'), 'utf8').trim();
  } catch {
    return '';
  }
})();
const localApiPort = apiUrl.match(/^http:\/\/(?:localhost|127\.0\.0\.1):(\d+)$/)?.[1];
if (localApiPort) {
  const reverse = sh(adb, ['-s', device, 'reverse', `tcp:${localApiPort}`, `tcp:${localApiPort}`]);
  if (reverse.status !== 0) fail(`adb reverse failed, so the app could not reach the API: ${reverse.stderr.trim()}`);
  console.log(`🔁 ${device} reaches this PC's API at ${apiUrl} (adb reverse).`);
}

console.log(`📲 Installing on ${device}...`);
const install = sh(adb, ['-s', device, 'install', '-r', apk], { stdio: 'inherit' });
if (install.status !== 0) fail('Install failed (see above).');
sh(adb, ['-s', device, 'shell', 'am', 'force-stop', APP_ID]);
sh(adb, ['-s', device, 'shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`], { stdio: 'inherit' });
// The mapping is dropped whenever the device's adb connection resets; set it again after the launch.
if (localApiPort) sh(adb, ['-s', device, 'reverse', `tcp:${localApiPort}`, `tcp:${localApiPort}`]);
console.log('✅ PulseFit is running. Keep `npm run dev` going so the app can reach the API.');
if (localApiPort) console.log(`   If the app says it cannot reach PulseFit after the device reconnects, run: adb reverse tcp:${localApiPort} tcp:${localApiPort}`);
