import { assertCommit, assertManifestMatches, githubClient, output, readManifest, readPackage, TOOLCHAIN, verifyReleaseAssets, versionFromTag } from './common.mjs';

const tag = process.env.RELEASE_TAG;
const commit = assertCommit(process.env.COMMIT_SHA);
const version = versionFromTag(tag);
const pkg = await readPackage();
if (pkg.version !== version) throw new Error(`Tag ${tag} does not match package version ${pkg.version}.`);
if (pkg.dependencies?.expo !== TOOLCHAIN.expo) throw new Error(`Expo must be pinned to ${TOOLCHAIN.expo}.`);

const client = githubClient();
if (await client.resolveTag(tag) !== commit) throw new Error('Tag changed after resolution; refusing to build.');
const release = await client.getRelease(tag);
if (release) {
  const manifest = readManifest(release.body);
  assertManifestMatches(manifest, tag, commit);
  if (!release.draft) {
    await verifyReleaseAssets(client, release, manifest);
    await output('skip', 'true');
    await output('release_url', release.html_url);
  } else {
    console.log('A matching draft exists; an interrupted release may be resumed.');
    await output('skip', 'false');
  }
} else {
  await output('skip', 'false');
}
