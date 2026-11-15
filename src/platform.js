// Maps the runner's platform/arch to the token bep/s3deploy uses in its
// release asset names. Only targets that upstream actually publishes are
// listed; anything else returns null and takes the `go install` fallback.
export function platformToken(platform, arch) {
  if (platform === 'linux' && arch === 'x64') return 'linux-amd64';
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) return 'darwin-universal';
  if (platform === 'win32' && arch === 'x64') return 'windows-amd64';
  return null;
}

export function binaryName(platform) {
  return platform === 'win32' ? 's3deploy.exe' : 's3deploy';
}

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Accepts "2.16.0" or "v2.16.0" and returns "2.16.0". Throws on anything else,
// so the value is safe to put in URLs and the tool-cache path.
export function normalizeVersion(input) {
  const v = String(input ?? '').trim().replace(/^v/, '');
  if (!VERSION_RE.test(v)) {
    throw new Error(`Invalid s3deploy version "${input}": expected a version like 2.16.0 (not "latest" or a range).`);
  }
  return v;
}

// Pulls the version out of `s3deploy -V` output, e.g.
// "s3deploy v2.16.0, commit abc, built at 2026-04-09" -> "2.16.0".
export function parseReportedVersion(output) {
  const m = /s3deploy\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(String(output ?? ''));
  return m ? m[1] : null;
}
