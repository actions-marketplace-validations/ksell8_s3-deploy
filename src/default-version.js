import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE = 'github.com/bep/s3deploy/v2';

// Path segments are kept in an array so the bundler doesn't inline go.mod into
// dist/: it must be read from the repository at run time, so a Dependabot bump
// of go.mod changes the default without rebuilding dist/.
const GO_MOD = ['..', 's3deploy-version', 'go.mod'];

// Returns "2.16.0" from a go.mod that requires github.com/bep/s3deploy/v2 v2.16.0
// (single-line or block require), or null.
export function parseGoModVersion(text) {
  const escaped = MODULE.replace(/[.]/g, '\\.');
  const re = new RegExp(`^\\s*(?:require\\s+)?${escaped}\\s+v(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)\\b`, 'm');
  const m = re.exec(String(text ?? '').replace(/\/\/.*$/gm, ''));
  return m ? m[1] : null;
}

// dist/index.js and src/*.js both sit one level below the repository root.
export function goModPath(fromUrl = import.meta.url) {
  return path.join(path.dirname(fileURLToPath(fromUrl)), ...GO_MOD);
}

export async function readDefaultVersion(file = goModPath()) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(`No version input given and the default could not be read from ${file}: ${err.message}`);
  }
  const v = parseGoModVersion(text);
  if (!v) throw new Error(`No version input given and ${file} has no "${MODULE} vX.Y.Z" requirement.`);
  return v;
}
