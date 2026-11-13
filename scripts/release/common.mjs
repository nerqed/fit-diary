import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';

export const TOOLCHAIN = Object.freeze({
  runner: 'macos-26',
  node: '22.23.4',
  xcode: '26.6',
  xcodeBuild: '17F113',
  developerDir: '/Applications/Xcode_26.6.app/Contents/Developer',
  expo: '58.0.25',
});

export function versionFromTag(tag) {
  if (typeof tag !== 'string' || tag.trim() !== tag || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
    throw new Error('Release tag must be an existing tag such as v0.1.0 (no spaces or prerelease suffix).');
  }
  return tag.slice(1);
}

export function assertCommit(commit) {
  if (typeof commit !== 'string' || commit.length !== 40 || !/^[0-9a-f]{40}$/.test(commit)) throw new Error('Expected a full lowercase commit SHA.');
  return commit;
}

export function ipaName(tag, commit) {
  versionFromTag(tag);
  assertCommit(commit);
  return `Forma-${tag}-${commit.slice(0, 12)}-unsigned.ipa`;
}

export function parseChecksum(text, expectedName) {
  const match = /^([0-9a-f]{64})  ([^\r\n]+)\r?\n?$/.exec(text);
  if (!match || match[2] !== expectedName) throw new Error('SHA256SUMS.txt does not describe exactly the expected IPA.');
  return match[1];
}

export function readManifest(body) {
  const matches = [...(body ?? '').matchAll(/<!-- forma-release:(\{[^\r\n]*\}) -->/g)];
  if (matches.length !== 1) throw new Error('Existing release has no unique Forma release manifest; refusing to alter it.');
  const manifest = JSON.parse(matches[0][1]);
  versionFromTag(manifest.tag);
  assertCommit(manifest.commit);
  if (manifest.ipa !== ipaName(manifest.tag, manifest.commit) || !/^[0-9a-f]{64}$/.test(manifest.sha256 ?? '')) {
    throw new Error('Invalid Forma release manifest.');
  }
  return manifest;
}

export function assertManifestMatches(manifest, tag, commit) {
  if (manifest.tag !== tag || manifest.commit !== commit || manifest.ipa !== ipaName(tag, commit)) {
    throw new Error('Release belongs to a different commit or tag. Published releases must not be overwritten.');
  }
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function output(name, value) {
  if (!/^[a-z_]+$/.test(name) || /[\r\n]/.test(String(value))) throw new Error('Unsafe workflow output.');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}: ${value}`);
}

export async function readPackage() {
  return JSON.parse(await readFile('package.json', 'utf8'));
}

export function githubClient({ repository = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('Invalid GitHub repository.');
  if (!token) throw new Error('GH_TOKEN is required for the release operation.');
  const base = `https://api.github.com/repos/${repository}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

  async function request(path, { method = 'GET', body, allow404 = false } = {}) {
    const response = await fetch(`${base}${path}`, {
      method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${path} failed (${response.status}).`);
    return response.status === 204 ? null : response.json();
  }

  async function assetResponse(asset) {
    const response = await fetch(`${base}/releases/assets/${asset.id}`, {
      headers: { ...headers, Accept: 'application/octet-stream' }, signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) throw new Error(`Could not read release asset ${asset.name} (${response.status}).`);
    return response;
  }

  return {
    repository,
    request,
    getRelease: (tag) => request(`/releases/tags/${encodeURIComponent(tag)}`, { allow404: true }),
    async resolveTag(tag) {
      versionFromTag(tag);
      let ref = (await request(`/git/ref/tags/${encodeURIComponent(tag)}`)).object;
      for (let depth = 0; ref.type === 'tag' && depth < 10; depth++) {
        ref = (await request(`/git/tags/${ref.sha}`)).object;
      }
      if (ref.type !== 'commit') throw new Error('Release tag does not resolve to a commit.');
      return assertCommit(ref.sha);
    },
    async assetText(asset) {
      if (asset.size > 16_384) throw new Error('Unexpectedly large release metadata asset.');
      return (await assetResponse(asset)).text();
    },
    async assetHash(asset) {
      if (/^sha256:[0-9a-f]{64}$/.test(asset.digest ?? '')) return asset.digest.slice(7);
      const hash = createHash('sha256');
      const response = await assetResponse(asset);
      for await (const chunk of Readable.fromWeb(response.body)) hash.update(chunk);
      return hash.digest('hex');
    },
    async upload(release, name, file, size) {
      const url = new URL(release.upload_url.split('{')[0]);
      if (url.protocol !== 'https:' || url.hostname !== 'uploads.github.com') throw new Error('Unexpected GitHub upload URL.');
      url.searchParams.set('name', name);
      const response = await fetch(url, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
        body: createReadStream(file), duplex: 'half', signal: AbortSignal.timeout(600_000),
      });
      if (!response.ok) throw new Error(`Upload of ${name} failed (${response.status}).`);
      return response.json();
    },
  };
}

export async function verifyReleaseAssets(client, release, manifest) {
  const expected = [manifest.ipa, 'SHA256SUMS.txt', 'BUILD_INFO.json'];
  const assets = expected.map((name) => {
    const matches = release.assets.filter((asset) => asset.name === name && asset.state === 'uploaded' && asset.size > 0);
    if (matches.length !== 1) throw new Error(`Release is missing one complete ${name} asset.`);
    return matches[0];
  });
  const checksum = parseChecksum(await client.assetText(assets[1]), manifest.ipa);
  if (checksum !== manifest.sha256 || await client.assetHash(assets[0]) !== checksum) {
    throw new Error('Release IPA checksum does not match its manifest.');
  }
  const buildInfo = JSON.parse(await client.assetText(assets[2]));
  if (buildInfo.commit !== manifest.commit || buildInfo.tag !== manifest.tag || buildInfo.sha256 !== checksum) {
    throw new Error('Release build report disagrees with its manifest.');
  }
}
