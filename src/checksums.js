import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

// Parses a sha256sum-style file ("<hex>  <name>" or "<hex> *<name>") into a
// Map of filename -> lowercase hex digest. Malformed lines are ignored.
export function parseChecksums(text) {
  const out = new Map();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(\S.*?)\s*$/.exec(raw.trim());
    if (m) out.set(m[2], m[1].toLowerCase());
  }
  return out;
}

const ARCHIVE_EXTS = ['.tar.gz', '.zip'];

// Finds the release archive for a platform token in the checksums file.
// Returns { name, sha256, format } or null when upstream has no archive for it
// (.deb/.pkg installers are ignored).
export function resolveAsset(checksumsText, version, token) {
  const sums = parseChecksums(checksumsText);
  for (const ext of ARCHIVE_EXTS) {
    for (const [name, sha256] of sums) {
      if (name.includes(`_${token}.`) && name.endsWith(ext) && name.startsWith(`s3deploy_${version}_`)) {
        return { name, sha256, format: ext === '.zip' ? 'zip' : 'tar.gz' };
      }
    }
  }
  return null;
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function checksumsFileName(version) {
  return `s3deploy_${version}_checksums.txt`;
}
