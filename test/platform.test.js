import { describe, expect, it } from 'vitest';
import { binaryName, normalizeVersion, parseReportedVersion, platformToken } from '../src/platform.js';

describe('platformToken', () => {
  it.each([
    ['linux', 'x64', 'linux-amd64'],
    ['darwin', 'x64', 'darwin-universal'],
    ['darwin', 'arm64', 'darwin-universal'],
    ['win32', 'x64', 'windows-amd64'],
  ])('%s/%s -> %s', (platform, arch, token) => {
    expect(platformToken(platform, arch)).toBe(token);
  });

  it.each([
    ['linux', 'arm64'],
    ['linux', 'arm'],
    ['win32', 'arm64'],
    ['freebsd', 'x64'],
    ['linux', 'ia32'],
  ])('%s/%s has no release binary', (platform, arch) => {
    expect(platformToken(platform, arch)).toBeNull();
  });
});

describe('binaryName', () => {
  it('adds .exe on Windows only', () => {
    expect(binaryName('win32')).toBe('s3deploy.exe');
    expect(binaryName('linux')).toBe('s3deploy');
    expect(binaryName('darwin')).toBe('s3deploy');
  });
});

describe('normalizeVersion', () => {
  it('strips a leading v and whitespace', () => {
    expect(normalizeVersion('v2.16.0')).toBe('2.16.0');
    expect(normalizeVersion(' 2.16.0 ')).toBe('2.16.0');
    expect(normalizeVersion('2.17.0-rc.1')).toBe('2.17.0-rc.1');
  });

  it.each(['latest', '2', '2.16', '^2.16.0', '2.16.0/../../x', ''])('rejects %j', (v) => {
    expect(() => normalizeVersion(v)).toThrow(/Invalid s3deploy version/);
  });
});

describe('parseReportedVersion', () => {
  it('reads the release binary output', () => {
    expect(parseReportedVersion('s3deploy v2.16.0, commit 1a2b3c, built at 2026-04-09T10:22:00Z\n')).toBe('2.16.0');
  });
  it('returns null for a devel build or empty output', () => {
    expect(parseReportedVersion('s3deploy (devel), commit none, built at unknown')).toBeNull();
    expect(parseReportedVersion('')).toBeNull();
  });
});
