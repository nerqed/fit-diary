import test from 'node:test';
import assert from 'node:assert/strict';
import { assertManifestMatches, ipaName, parseChecksum, readManifest, verifyReleaseAssets, versionFromTag } from './common.mjs';

const commit = 'a'.repeat(40);
const hash = 'b'.repeat(64);
const filename = ipaName('v0.1.0', commit);
const manifest = { tag: 'v0.1.0', commit, ipa: filename, sha256: hash };

test('tag inputs cannot inject shell text, paths or workflow output', () => {
  for (const value of ['v0.1.0\n', 'v0.1.0\r', 'v0.1.0\r\n', 'v0.1.0\nrun=true', '../v0.1.0', 'v0.1.0;echo bad', 'v01.2.3', ' v0.1.0', 'v0.1.0-beta', '${{ secrets.TOKEN }}']) {
    assert.throws(() => versionFromTag(value));
  }
  assert.equal(versionFromTag('v0.1.0'), '0.1.0');
});

test('a checksum file must identify only the exact IPA', () => {
  assert.equal(parseChecksum(`${hash}  ${filename}\n`, filename), hash);
  assert.throws(() => parseChecksum(`${hash}  ../different.ipa\n`, filename));
  assert.throws(() => parseChecksum(`${hash}  ${filename}\n${hash}  other.ipa\n`, filename));
});

test('foreign or moved-tag releases are never treated as owned releases', () => {
  assert.throws(() => readManifest('Manually created release'));
  const marker = `<!-- forma-release:${JSON.stringify(manifest)} -->`;
  assert.deepEqual(readManifest(marker), manifest);
  assert.throws(() => readManifest(`${marker}\n${marker}`));
  assert.throws(() => assertManifestMatches(manifest, 'v0.1.0', 'c'.repeat(40)));
});

test('dedup requires complete assets and matching checksum/build provenance', async () => {
  const assets = [filename, 'SHA256SUMS.txt', 'BUILD_INFO.json'].map((name, i) => ({ id: i + 1, name, state: 'uploaded', size: 100 }));
  const client = {
    assetText: async (asset) => asset.name === 'SHA256SUMS.txt' ? `${hash}  ${filename}\n` : JSON.stringify({ tag: manifest.tag, commit, sha256: hash }),
    assetHash: async () => hash,
  };
  await verifyReleaseAssets(client, { assets }, manifest);
  await assert.rejects(verifyReleaseAssets(client, { assets: assets.slice(0, 2) }, manifest));
  await assert.rejects(verifyReleaseAssets({ ...client, assetHash: async () => 'd'.repeat(64) }, { assets }, manifest));
  await assert.rejects(verifyReleaseAssets(client, { assets: [...assets, assets[0]] }, manifest));
});
