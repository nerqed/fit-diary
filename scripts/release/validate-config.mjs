import { execFileSync } from 'node:child_process';
import { readPackage, versionFromTag } from './common.mjs';

const version = versionFromTag(process.env.RELEASE_TAG);
const pkg = await readPackage();
const config = JSON.parse(execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'public', '--json'], {
  encoding: 'utf8', env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
}));
const required = [
  [pkg.version === version && config.version === version, 'package/app versions must match the release tag'],
  [config.name === 'Forma', 'Expo name must stay Latin: Forma'],
  [config.slug === 'forma', 'Expo slug must be forma'],
  [config.ios?.bundleIdentifier === 'com.nerqed.forma', 'Unexpected iOS bundle identifier'],
  [config.ios?.infoPlist?.CFBundleDisplayName === 'Форма', 'Russian display name must be set explicitly'],
  [!config.updates?.url && config.updates?.enabled !== true, 'Stage 1 must not configure remote updates'],
  [!config.extra?.eas?.projectId, 'Stage 1 must not depend on an EAS project'],
];
for (const [valid, message] of required) if (!valid) throw new Error(message);
console.log('Release app configuration validated.');
