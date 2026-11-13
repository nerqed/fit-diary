import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertCommit, ipaName, readPackage, sha256File, TOOLCHAIN, versionFromTag } from './common.mjs';

function capture(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options }).trim();
}
function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}
function assert(condition, message) { if (!condition) throw new Error(message); }
async function plist(file) {
  return JSON.parse(capture('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]));
}

assert(process.platform === 'darwin', 'Unsigned device archives must be built on the pinned macOS runner.');
assert(process.arch === 'arm64', 'Expected the arm64 macos-26 runner.');
assert(process.version === `v${TOOLCHAIN.node}`, `Expected Node ${TOOLCHAIN.node}, got ${process.version}.`);
assert(process.env.DEVELOPER_DIR === TOOLCHAIN.developerDir && existsSync(TOOLCHAIN.developerDir), 'Pinned Xcode directory is missing or not selected.');
const xcode = capture('xcodebuild', ['-version']);
assert(xcode === `Xcode ${TOOLCHAIN.xcode}\nBuild version ${TOOLCHAIN.xcodeBuild}`, `Pinned Xcode mismatch: ${xcode}. No automatic fallback is allowed.`);
assert(!process.env.SKIP_BUNDLING, 'SKIP_BUNDLING must not be set for a standalone Release.');

const tag = process.env.RELEASE_TAG;
const commit = assertCommit(process.env.COMMIT_SHA);
const version = versionFromTag(tag);
const pkg = await readPackage();
assert(pkg.version === version && pkg.dependencies?.expo === TOOLCHAIN.expo, 'App/Expo version does not match release configuration.');
assert(capture('git', ['rev-parse', 'HEAD']) === commit, 'Checkout is not the resolved tag commit.');
const packageHash = await sha256File('package.json');
const lockHash = await sha256File('package-lock.json');
const tempRoot = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? process.cwd(), 'forma-release-'));
const archive = path.join(tempRoot, 'Forma.xcarchive');
const payloadRoot = path.join(tempRoot, 'package');
const payload = path.join(payloadRoot, 'Payload');
const releaseDir = path.resolve(process.env.RELEASE_DIR ?? path.join(tempRoot, 'release'));
await mkdir(payload, { recursive: true });
await mkdir(releaseDir, { recursive: true });

console.log(`Runner image: ${process.env.ImageVersion ?? 'not reported'}; ${xcode}; Node ${process.version}`);
run('npx', ['--no-install', 'expo', 'prebuild', '-p', 'ios', '--no-install'], { env: { ...process.env, CI: '1' } });
assert(await sha256File('package.json') === packageHash && await sha256File('package-lock.json') === lockHash, 'Prebuild changed dependency files; reconcile and commit the lockfile before releasing.');
assert(existsSync('ios/Forma.xcodeproj'), 'Prebuild must generate the Latin-named Forma Xcode project.');
// Override only generated machine-specific Node discovery, never the shared project settings.
const quotedNodePath = `'${process.execPath.replaceAll("'", "'\\''")}'`;
await writeFile('ios/.xcode.env.local', `export NODE_BINARY=${quotedNodePath}\n`);
run('pod', ['install'], { cwd: path.resolve('ios') });
assert(existsSync('ios/Forma.xcworkspace'), 'CocoaPods did not generate Forma.xcworkspace.');
run('xcodebuild', [
  'archive', '-workspace', 'ios/Forma.xcworkspace', '-scheme', 'Forma', '-configuration', 'Release',
  '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS', '-archivePath', archive,
  'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=',
]);

const applications = path.join(archive, 'Products', 'Applications');
const apps = (await readdir(applications)).filter((name) => name.endsWith('.app'));
assert(apps.length === 1 && apps[0] === 'Forma.app', 'Archive must contain exactly Products/Applications/Forma.app.');
const app = path.join(applications, 'Forma.app');
const info = await plist(path.join(app, 'Info.plist'));
assert(info.CFBundleIdentifier === 'com.nerqed.forma', 'Unexpected bundle identifier.');
assert(info.CFBundleExecutable === 'Forma', 'Executable must be named Forma.');
assert(info.CFBundleDisplayName === 'Форма', 'Display name must be Форма.');
assert(info.CFBundleShortVersionString === version, 'Archived version does not match tag.');
assert(info.CFBundleSupportedPlatforms?.includes('iPhoneOS'), 'Archive is not for physical iPhoneOS devices.');
const executable = path.join(app, 'Forma');
// -verify_arch consumes all following arguments as architectures, so the input goes first.
run('xcrun', ['lipo', executable, '-verify_arch', 'arm64']);
const platformInfo = capture('xcrun', ['vtool', '-show-build', executable]);
assert(/platform\s+IOS\b/.test(platformInfo) && !/IOSSIMULATOR/.test(platformInfo), 'Mach-O must target iOS devices, not the simulator.');
const bundle = path.join(app, 'main.jsbundle');
assert(existsSync(bundle) && (await stat(bundle)).size > 0, 'Embedded main.jsbundle is missing; app must start without Metro.');
assert(!existsSync(path.join(app, 'embedded.mobileprovision')), 'Unsigned artifact must not contain a provisioning profile.');
assert(spawnSync('/usr/bin/codesign', ['-dv', app], { stdio: 'pipe' }).status !== 0, 'Main app unexpectedly contains a signature.');
const expoPlist = path.join(app, 'Expo.plist');
if (existsSync(expoPlist)) {
  const expo = await plist(expoPlist);
  assert(expo.EXUpdatesEnabled !== true && !expo.EXUpdatesURL, 'Stage 1 must not depend on remote Expo updates.');
}

run('/usr/bin/ditto', [app, path.join(payload, 'Forma.app')]);
const filename = ipaName(tag, commit);
const ipa = path.join(releaseDir, filename);
run('/usr/bin/zip', ['-qry', ipa, 'Payload'], { cwd: payloadRoot });
run('/usr/bin/unzip', ['-tq', ipa]);
const entries = capture('/usr/bin/unzip', ['-Z1', ipa]).split('\n');
assert(entries.every((name) => name === 'Payload/' || name.startsWith('Payload/Forma.app/')), 'IPA contains an unexpected top-level entry.');
assert(entries.includes('Payload/Forma.app/Forma') && entries.includes('Payload/Forma.app/main.jsbundle'), 'IPA is missing its executable or embedded JavaScript.');
const sha256 = await sha256File(ipa);
await writeFile(path.join(releaseDir, 'SHA256SUMS.txt'), `${sha256}  ${filename}\n`);
const report = {
  tag, version, commit, ipa: filename, sha256, buildNumber: info.CFBundleVersion,
  bundleIdentifier: info.CFBundleIdentifier, displayName: info.CFBundleDisplayName,
  minimumIOS: info.MinimumOSVersion, runner: TOOLCHAIN.runner, architecture: process.arch,
  imageVersion: process.env.ImageVersion ?? null, macOS: capture('sw_vers', ['-productVersion']),
  xcode: TOOLCHAIN.xcode, xcodeBuild: TOOLCHAIN.xcodeBuild, node: process.version,
  expo: pkg.dependencies.expo, cocoaPods: capture('pod', ['--version']),
  packageLockSha256: lockHash, podLockSha256: await sha256File('ios/Podfile.lock'),
  embeddedBundleSha256: await sha256File(bundle), unsigned: true,
  checks: ['archive-path', 'bundle-identifiers', 'iphoneos-arm64', 'embedded-js', 'no-profile', 'unsigned-app', 'zip-integrity', 'sha256'],
  builtAt: new Date().toISOString(),
};
await writeFile(path.join(releaseDir, 'BUILD_INFO.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Verified unsigned IPA: ${filename}\nSHA-256: ${sha256}`);
