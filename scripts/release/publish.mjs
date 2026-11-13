import { appendFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { assertCommit, assertManifestMatches, githubClient, ipaName, readManifest, sha256File, verifyReleaseAssets, versionFromTag } from './common.mjs';

const directory = path.resolve(process.env.RELEASE_DIR ?? 'release');
const info = JSON.parse(await readFile(path.join(directory, 'BUILD_INFO.json'), 'utf8'));
versionFromTag(info.tag);
assertCommit(info.commit);
if (info.ipa !== ipaName(info.tag, info.commit) || await sha256File(path.join(directory, info.ipa)) !== info.sha256) {
  throw new Error('Downloaded build report and IPA disagree.');
}
if (info.tag !== process.env.RELEASE_TAG || info.commit !== process.env.COMMIT_SHA) throw new Error('Downloaded artifact belongs to another workflow target.');
const client = githubClient();
if (await client.resolveTag(info.tag) !== info.commit) throw new Error('Tag moved after build; refusing to publish.');
const manifest = { tag: info.tag, commit: info.commit, ipa: info.ipa, sha256: info.sha256 };
const body = [
  `# Forma ${info.tag} — технический каркас`, '',
  'Неподписанное приложение для самостоятельной подписи через E Sign. Данные экранов демонстрационные.', '',
  `- Версия: ${info.version} (${info.buildNumber})`, `- Коммит: ${info.commit}`,
  `- SHA-256 неподписанного IPA: \`${info.sha256}\``,
  `- Среда: ${info.runner} / ${info.architecture}; образ ${info.imageVersion ?? 'не указан'}`,
  `- Xcode: ${info.xcode} (${info.xcodeBuild}); Node: ${info.node}; Expo: ${info.expo}; CocoaPods: ${info.cocoaPods}`, '',
  '## Установка с iPhone', '',
  'Откройте эту страницу в Safari под своим GitHub-аккаунтом, скачайте файл `.ipa` из Assets в «Файлы», импортируйте его в E Sign и подпишите своим сертификатом. Затем установите приложение.', '',
  '## Что проверено', '',
  'Архив для iPhone/arm64, идентификаторы, встроенный JS-бандл, отсутствие подписи и provisioning profile, целостность ZIP и контрольная сумма.', '',
  '## Что ещё требуется проверить', '',
  'Установка через E Sign и запуск на iPhone 15 Pro Max с iOS 26.6.1; переходы вкладок и повторный запуск в авиарежиме. Совместимость конкретного сертификата не подтверждена до проверки владельцем.', '',
  'Реальный дневник, ИИ, камера, облако и дизайн пока не реализованы. После подписи контрольная сумма файла изменится.', '',
  `<!-- forma-release:${JSON.stringify(manifest)} -->`,
].join('\n');

let release = await client.getRelease(info.tag);
if (release) {
  assertManifestMatches(readManifest(release.body), info.tag, info.commit);
  if (!release.draft) {
    await verifyReleaseAssets(client, release, manifest);
    console.log(`Already published and verified: ${release.html_url}`);
    process.exit(0);
  }
  release = await client.request(`/releases/${release.id}`, { method: 'PATCH', body: { body, name: `Forma ${info.tag} — каркас`, target_commitish: info.commit } });
} else {
  release = await client.request('/releases', { method: 'POST', body: {
    tag_name: info.tag, target_commitish: info.commit, name: `Forma ${info.tag} — каркас`, body, draft: true, prerelease: false,
  } });
}

for (const name of [info.ipa, 'SHA256SUMS.txt', 'BUILD_INFO.json']) {
  const file = path.join(directory, name);
  const expectedHash = await sha256File(file);
  const existing = release.assets.find((asset) => asset.name === name);
  if (existing) {
    if (existing.state === 'uploaded' && await client.assetHash(existing) === expectedHash) continue;
    // Only an unpublished draft created by this pipeline may have partial assets replaced.
    await client.request(`/releases/assets/${existing.id}`, { method: 'DELETE' });
  }
  await client.upload(release, name, file, (await stat(file)).size);
}
release = await client.request(`/releases/${release.id}`);
await verifyReleaseAssets(client, release, manifest);
release = await client.request(`/releases/${release.id}`, { method: 'PATCH', body: { draft: false, make_latest: 'true' } });
console.log(`Published verified release: ${release.html_url}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Forma ${info.tag}\n\n[Скачать IPA](${release.html_url})\n\nКоммит: \`${info.commit}\`\n\nSHA-256: \`${info.sha256}\`\n`);
}
