import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checksumsFileName, parseChecksums, resolveAsset, sha256File } from '../src/checksums.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// The real checksums file from the s3deploy v2.16.0 release.
const real = await readFile(path.join(here, 'fixtures', 's3deploy_2.16.0_checksums.txt'), 'utf8');

describe('parseChecksums', () => {
  it('parses the real release file', () => {
    const m = parseChecksums(real);
    expect(m.size).toBe(5);
    expect(m.get('s3deploy_2.16.0_linux-amd64.tar.gz')).toBe(
      '66ea2e9fe04b28784899c9d76c3813ffcd39ae602cc3933b205daa23a553f6dc',
    );
  });

  it('handles binary-mode markers, CRLF, upper case and junk', () => {
    const text = `${'A'.repeat(64)} *foo.zip\r\nnot a line\n${'b'.repeat(63)}  short.tar.gz\n\n`;
    const m = parseChecksums(text);
    expect([...m]).toEqual([['foo.zip', 'a'.repeat(64)]]);
  });
});

describe('resolveAsset', () => {
  it.each([
    ['linux-amd64', 's3deploy_2.16.0_linux-amd64.tar.gz', 'tar.gz'],
    ['darwin-universal', 's3deploy_2.16.0_darwin-universal.tar.gz', 'tar.gz'],
    ['windows-amd64', 's3deploy_2.16.0_windows-amd64.zip', 'zip'],
  ])('%s -> %s (ignores .deb/.pkg)', (token, name, format) => {
    const a = resolveAsset(real, '2.16.0', token);
    expect(a).toMatchObject({ name, format });
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns null when there is no archive for the platform', () => {
    expect(resolveAsset(real, '2.16.0', 'linux-arm64')).toBeNull();
  });

  it('does not match another version listed in the file', () => {
    expect(resolveAsset(real, '2.15.0', 'linux-amd64')).toBeNull();
  });

  it('names the checksums file', () => {
    expect(checksumsFileName('2.16.0')).toBe('s3deploy_2.16.0_checksums.txt');
  });
});

describe('sha256File', () => {
  it('hashes a file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sha-'));
    const f = path.join(dir, 'x');
    await writeFile(f, 'hello\n');
    expect(await sha256File(f)).toBe('5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03');
  });
});
