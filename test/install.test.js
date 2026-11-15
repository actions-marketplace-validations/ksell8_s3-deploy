// Exercises install() end to end against a local HTTP server that stands in
// for the GitHub release (or a download-base-url mirror). No network needed.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import { zipSync } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const VERSION = '9.9.9';
let root;
let server;
let baseUrl;
let install;
let extractBinary;

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function writeRelease(dir, { corrupt = false } = {}) {
  const rel = path.join(dir, `v${VERSION}`);
  await mkdir(rel, { recursive: true });
  const src = await mkdtemp(path.join(root, 'src-'));
  await writeFile(path.join(src, 's3deploy'), '#!/bin/sh\necho "s3deploy v9.9.9, commit x, built at y"\n');
  await writeFile(path.join(src, 'README.md'), 'readme');
  const tgz = `s3deploy_${VERSION}_linux-amd64.tar.gz`;
  await tar.c({ gzip: true, file: path.join(rel, tgz), cwd: src }, ['s3deploy', 'README.md']);
  const zip = `s3deploy_${VERSION}_windows-amd64.zip`;
  await writeFile(path.join(rel, zip), zipSync({ 's3deploy.exe': new TextEncoder().encode('MZ fake'), 'LICENSE': new Uint8Array([1]) }));
  const deb = `s3deploy_${VERSION}_linux-amd64.deb`;
  await writeFile(path.join(rel, deb), 'not an archive');
  const lines = [];
  for (const f of [tgz, deb, zip]) {
    const digest = sha(await readFile(path.join(rel, f)));
    lines.push(`${corrupt && f === tgz ? '0'.repeat(64) : digest}  ${f}`);
  }
  await writeFile(path.join(rel, `s3deploy_${VERSION}_checksums.txt`), lines.join('\n') + '\n');
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 's3deploy-action-test-'));
  await writeRelease(path.join(root, 'good'));
  await writeRelease(path.join(root, 'bad'), { corrupt: true });
  server = http.createServer(async (req, res) => {
    try {
      const body = await readFile(path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      res.writeHead(200).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.RUNNER_TEMP = path.join(root, 'temp');
  await mkdir(process.env.RUNNER_TEMP, { recursive: true });
  ({ install } = await import('../src/install.js'));
  ({ extractBinary } = await import('../src/extract.js'));
});

afterAll(() => server?.close());

beforeEach(async () => {
  process.env.RUNNER_TOOL_CACHE = await mkdtemp(path.join(root, 'cache-'));
});

const opts = (extra) => ({ version: VERSION, usePreinstalled: false, goFallback: true, ...extra });

describe('install (release path)', () => {
  it('downloads, verifies, extracts and caches; second call is a cache hit', async () => {
    const first = await install(opts({ baseUrl: `${baseUrl}/good`, platform: 'linux', arch: 'x64' }));
    expect(first).toMatchObject({ method: 'release', cacheHit: false });
    expect(path.basename(first.path)).toBe('s3deploy');
    expect(first.dir.startsWith(process.env.RUNNER_TOOL_CACHE)).toBe(true);
    if (process.platform !== 'win32') expect((await stat(first.path)).mode & 0o111).not.toBe(0);

    const second = await install(opts({ baseUrl: `${baseUrl}/good`, platform: 'linux', arch: 'x64' }));
    expect(second).toMatchObject({ method: 'cache', cacheHit: true, path: first.path });
  });

  it('handles the Windows zip and .exe', async () => {
    const r = await install(opts({ baseUrl: `${baseUrl}/good`, platform: 'win32', arch: 'x64' }));
    expect(r.method).toBe('release');
    expect(await readFile(r.path, 'utf8')).toBe('MZ fake');
  });

  it('fails hard on a checksum mismatch and caches nothing', async () => {
    await expect(install(opts({ baseUrl: `${baseUrl}/bad`, platform: 'linux', arch: 'x64' }))).rejects.toThrow(
      /Checksum mismatch/,
    );
    await expect(install(opts({ baseUrl: `${baseUrl}/bad`, platform: 'linux', arch: 'x64' }))).rejects.toThrow(
      /Checksum mismatch/,
    );
  });

  it('fails when the checksums file is missing instead of falling back', async () => {
    await expect(install(opts({ baseUrl: `${baseUrl}/nope`, platform: 'linux', arch: 'x64' }))).rejects.toThrow();
  });
});

describe('install (go fallback)', () => {
  it('fails with a clear message when go is not on PATH', async () => {
    const saved = process.env.PATH;
    process.env.PATH = await mkdtemp(path.join(root, 'empty-path-'));
    try {
      await expect(install(opts({ baseUrl: `${baseUrl}/good`, platform: 'linux', arch: 'arm64' }))).rejects.toThrow(
        'no prebuilt binary for linux/arm64. Add actions/setup-go before this step, or set go-fallback: false.',
      );
    } finally {
      process.env.PATH = saved;
    }
  });

  it('fails without trying go when go-fallback is false', async () => {
    await expect(
      install(opts({ baseUrl: `${baseUrl}/good`, platform: 'linux', arch: 'arm64', goFallback: false })),
    ).rejects.toThrow(/go-fallback is false/);
  });

  it('falls back when the checksums file lists no archive for a mapped platform', async () => {
    await expect(
      install(opts({ baseUrl: `${baseUrl}/good`, platform: 'darwin', arch: 'arm64', goFallback: false })),
    ).rejects.toThrow(/no prebuilt binary for darwin\/arm64/);
  });
});

describe('extractBinary', () => {
  it('refuses an archive without the binary', async () => {
    const dir = await mkdtemp(path.join(root, 'x-'));
    const zip = path.join(dir, 'a.zip');
    await writeFile(zip, zipSync({ 'other.exe': new Uint8Array([1]) }));
    await expect(extractBinary(zip, 'zip', 's3deploy.exe', path.join(dir, 'out'))).rejects.toThrow(/not found/);
  });
});
