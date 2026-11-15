import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as tar from 'tar';
import { unzipSync } from 'fflate';

// Extracts only the s3deploy binary from a release archive into destDir.
// Pure JavaScript on purpose: @actions/tool-cache's extractTar/extractZip
// shell out to tar, unzip or PowerShell, which self-hosted runners may lack.
export async function extractBinary(archive, format, binary, destDir) {
  await mkdir(destDir, { recursive: true });
  const target = path.join(destDir, binary);
  if (format === 'tar.gz') {
    let found = false;
    await tar.x({
      file: archive,
      cwd: destDir,
      strict: true,
      filter: (p, entry) => {
        const ok = p.replace(/^\.\//, '') === binary && entry.type === 'File';
        if (ok) found = true;
        return ok;
      },
    });
    if (!found) throw new Error(`${binary} not found in ${path.basename(archive)}`);
  } else if (format === 'zip') {
    const files = unzipSync(new Uint8Array(await readFile(archive)), {
      filter: (f) => f.name === binary,
    });
    if (!files[binary]) throw new Error(`${binary} not found in ${path.basename(archive)}`);
    await writeFile(target, files[binary]);
  } else {
    throw new Error(`Unsupported archive format: ${format}`);
  }
  if (process.platform !== 'win32') await chmod(target, 0o755);
  return target;
}
