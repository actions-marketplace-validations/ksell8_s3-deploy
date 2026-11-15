import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { goModPath, parseGoModVersion, readDefaultVersion } from '../src/default-version.js';

describe('parseGoModVersion', () => {
  it('reads a single-line require', () => {
    expect(parseGoModVersion('module x\n\ngo 1.25.0\n\nrequire github.com/bep/s3deploy/v2 v2.16.0\n')).toBe('2.16.0');
  });

  it('reads a require block as Dependabot / go mod tidy write it', () => {
    const text = `module x

go 1.25.0

require github.com/bep/s3deploy/v2 v2.17.1

require (
\tgithub.com/aws/aws-sdk-go-v2 v1.39.0 // indirect
\tgithub.com/bep/s3deploy/v2/other v9.9.9 // indirect
)
`;
    expect(parseGoModVersion(text)).toBe('2.17.1');
    expect(parseGoModVersion('require (\n\tgithub.com/bep/s3deploy/v2 v2.18.0-rc.1\n)\n')).toBe('2.18.0-rc.1');
  });

  it('ignores comments and other modules', () => {
    expect(parseGoModVersion('// github.com/bep/s3deploy/v2 v1.0.0\nrequire github.com/bep/s3deploy v1.2.3\n')).toBeNull();
  });
});

describe('readDefaultVersion', () => {
  it('reads the repository pin', async () => {
    expect(goModPath()).toMatch(/s3deploy-version[\\/]go\.mod$/);
    expect(await readDefaultVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('explains a missing or broken file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gomod-'));
    await expect(readDefaultVersion(path.join(dir, 'nope'))).rejects.toThrow(/could not be read/);
    const f = path.join(dir, 'go.mod');
    await writeFile(f, 'module x\n');
    await expect(readDefaultVersion(f)).rejects.toThrow(/has no "github.com\/bep\/s3deploy\/v2 vX.Y.Z"/);
  });
});
