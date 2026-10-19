// Builds the signed release APK of the Android app against the live site.
//
//   npm run mobile:release                                   against https://pulsefit.up.railway.app
//   npm run mobile:release -- --api https://gym.example.com  another https server (--api=<url> works too)
//
// The first run creates the release key: %USERPROFILE%\.pulsefit\pulsefit-release.jks with a random
// password, recorded in client/android/keystore.properties (git-ignored). Later runs reuse both. Back
// them up: Android only installs an update signed with the same key as the app already on the phone.
// Bump versionCode/versionName in client/android/app/build.gradle before building a new version.
//
// This leaves the app built against the live site; `npm run mobile:sync` (or start-pulsefit-app.bat)
// puts it back on the API on this PC for local testing.
// Needs JAVA_HOME (JDK 21, for keytool) and ANDROID_HOME (Android SDK, for apksigner).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIVE_API = 'https://pulsefit.up.railway.app';
const KEY_ALIAS = 'pulsefit';
const KEY_DNAME = 'CN=PulseFit Athletics, O=PulseFit Athletics, L=Gurugram, C=IN';
const isWindows = process.platform === 'win32';
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(clientDir, 'android');
const propsFile = path.join(androidDir, 'keystore.properties');
const defaultStoreFile = path.join(os.homedir(), '.pulsefit', 'pulsefit-release.jks');
const releaseDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release');
const fail = message => {
  console.error(message);
  process.exit(1);
};

let api = process.env.PULSEFIT_API_URL || LIVE_API;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api') api = args[++i];
  else if (args[i].startsWith('--api=')) api = args[i].slice('--api='.length);
  else fail(`Unknown option "${args[i]}". Usage: npm run mobile:release [-- --api https://<domain>]`);
}
if (!api || !/^https:\/\/[^/\s]+\/*$/.test(api)) {
  fail(`A release talks to the API over https only: "${api ?? ''}" is not an address like ${LIVE_API}.`);
}

const javaHome = process.env.JAVA_HOME;
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!javaHome) fail('JAVA_HOME is not set. Point it at a JDK 21 (see README › Android & iOS Apps).');
if (!sdk) fail('ANDROID_HOME is not set. Point it at your Android SDK (see README › Android & iOS Apps).');
const keytool = path.join(javaHome, 'bin', isWindows ? 'keytool.exe' : 'keytool');
const buildTools = path.join(sdk, 'build-tools');
const latestBuildTools = fs.existsSync(buildTools)
  ? fs.readdirSync(buildTools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop()
  : undefined;
const apksigner = latestBuildTools && path.join(buildTools, latestBuildTools, isWindows ? 'apksigner.bat' : 'apksigner');
if (!apksigner || !fs.existsSync(apksigner)) fail(`apksigner not found under ${buildTools}. Install the SDK build-tools.`);

// The release key: reuse keystore.properties when it exists, otherwise create a new key. Never
// replace an existing keystore: losing it means installed apps can no longer be updated.
if (fs.existsSync(propsFile)) {
  const storeFile = fs.readFileSync(propsFile, 'utf8').match(/^storeFile=(.+)$/m)?.[1]?.trim();
  if (!storeFile || !fs.existsSync(storeFile)) {
    fail(`${propsFile} names a keystore that does not exist (${storeFile ?? 'no storeFile'}). Restore it from your backup.`);
  }
  console.log(`🔑 Signing with the release key in ${storeFile}`);
} else if (fs.existsSync(defaultStoreFile)) {
  fail(`${defaultStoreFile} exists but ${propsFile} does not. Restore keystore.properties from your backup.`);
} else {
  if (!fs.existsSync(keytool)) fail(`keytool not found at ${keytool}. Point JAVA_HOME at a JDK 21.`);
  console.log(`🔑 Creating the release key in ${defaultStoreFile}`);
  fs.mkdirSync(path.dirname(defaultStoreFile), { recursive: true });
  // base64url: no characters that need escaping in a .properties file. PKCS12 keystores use the
  // store password for the key too. Handed to keytool through the environment, never the command line.
  const password = crypto.randomBytes(32).toString('base64url');
  const keygen = spawnSync(
    keytool,
    [
      '-genkeypair', '-keystore', defaultStoreFile, '-storetype', 'PKCS12', '-alias', KEY_ALIAS,
      '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-dname', KEY_DNAME,
      '-storepass:env', 'PULSEFIT_KEYSTORE_PASSWORD', '-keypass:env', 'PULSEFIT_KEYSTORE_PASSWORD'
    ],
    { stdio: 'inherit', env: { ...process.env, PULSEFIT_KEYSTORE_PASSWORD: password } }
  );
  if (keygen.status !== 0) fail('keytool could not create the release key (see above).');
  // Forward slashes: a backslash is an escape character in .properties files.
  const storePath = defaultStoreFile.replace(/\\/g, '/');
  fs.writeFileSync(
    propsFile,
    `# Release signing key for the PulseFit app. Keep secret, keep out of git, back up with the keystore.\n` +
      `storeFile=${storePath}\nstorePassword=${password}\nkeyAlias=${KEY_ALIAS}\nkeyPassword=${password}\n`,
    { mode: 0o600 }
  );
  console.log(`   Back up ${defaultStoreFile} and ${propsFile} somewhere safe.`);
}

const sync = spawnSync(process.execPath, [path.join(clientDir, 'scripts', 'mobile-sync.mjs'), '--api', api], {
  stdio: 'inherit'
});
if (sync.status !== 0) fail('Building the app failed (see above).');

console.log('🔨 Building the release APK...');
// Full path: some Windows setups (NoDefaultCurrentDirectoryInExePath) never run a bare gradlew.bat.
const gradle = isWindows
  ? spawnSync(`"${path.join(androidDir, 'gradlew.bat')}" assembleRelease`, { cwd: androidDir, stdio: 'inherit', shell: true })
  : spawnSync(path.join(androidDir, 'gradlew'), ['assembleRelease'], { cwd: androidDir, stdio: 'inherit' });
if (gradle.status !== 0) fail('Gradle build failed (see above). Check that JAVA_HOME points to a JDK 21.');
const apk = path.join(releaseDir, 'app-release.apk');
if (!fs.existsSync(apk)) fail(`No signed APK at ${apk}. Is ${propsFile} complete?`);

const verify = spawnSync(`"${apksigner}" verify --verbose --print-certs "${apk}"`, { encoding: 'utf8', shell: true });
if (verify.status !== 0) fail(`apksigner could not verify ${apk}:\n${verify.stdout}${verify.stderr}`);
const verifiedLines = verify.stdout.split(/\r?\n/).filter(line => /^Verified using v[23] scheme.*true|^Signer #1 certificate (DN|SHA-256)/.test(line));

const { elements } = JSON.parse(fs.readFileSync(path.join(releaseDir, 'output-metadata.json'), 'utf8'));
const { versionName, versionCode } = elements[0];
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
console.log(`✅ PulseFit ${versionName} (versionCode ${versionCode}), built against ${api.replace(/\/+$/, '')}`);
console.log(`   ${apk}`);
console.log(`   ${fs.statSync(apk).size} bytes, sha256 ${sha256}`);
for (const line of verifiedLines) console.log(`   ${line}`);
console.log('   Publish it as downloads/pulsefit.apk next to the database (deploy/README.md › Android app).');
console.log('   `npm run mobile:sync` puts the app back on the API on this PC for local testing.');
