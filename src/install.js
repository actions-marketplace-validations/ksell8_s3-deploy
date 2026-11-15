import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as tc from '@actions/tool-cache';
import { checksumsFileName, resolveAsset, sha256File } from './checksums.js';
import { extractBinary } from './extract.js';
import { binaryName, parseReportedVersion, platformToken } from './platform.js';

const TOOL = 's3deploy';

// @actions/tool-cache needs RUNNER_TOOL_CACHE and RUNNER_TEMP. Every runner
// sets both, but give sane defaults if someone runs the action elsewhere.
export function ensureRunnerDirs(env = process.env) {
  if (!env.RUNNER_TEMP) env.RUNNER_TEMP = path.join(os.tmpdir(), 's3deploy-action-temp');
  if (!env.RUNNER_TOOL_CACHE) env.RUNNER_TOOL_CACHE = path.join(os.tmpdir(), 's3deploy-action-tool-cache');
}

async function tempDir(prefix) {
  return mkdtemp(path.join(process.env.RUNNER_TEMP, prefix));
}

// Runs `<bin> -V` in an empty directory with S3DEPLOY_* removed so a project
// .s3deploy.yml or S3DEPLOY_QUIET can't change or break the output.
export async function reportedVersion(bin) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('S3DEPLOY_')));
  const cwd = await tempDir('s3deploy-version-');
  const { stdout, stderr, exitCode } = await exec.getExecOutput(bin, ['-quiet=false', '-V'], {
    cwd,
    env,
    silent: true,
    ignoreReturnCode: true,
  });
  if (exitCode !== 0) throw new Error(`"${bin} -V" exited with ${exitCode}: ${stderr.trim()}`);
  return parseReportedVersion(stdout);
}

async function fromRelease({ version, baseUrl, asset, binary, arch }) {
  const url = `${baseUrl}/v${version}/${asset.name}`;
  core.info(`Downloading ${url}`);
  const archive = await tc.downloadTool(url);
  const actual = await sha256File(archive);
  if (actual !== asset.sha256) {
    throw new Error(`Checksum mismatch for ${asset.name}: expected ${asset.sha256}, got ${actual}. Refusing to install.`);
  }
  core.info(`Checksum OK (sha256 ${actual})`);
  const dir = await tempDir('s3deploy-extract-');
  await extractBinary(archive, asset.format, binary, dir);
  return tc.cacheDir(dir, TOOL, version, arch);
}

async function fromGo({ version, binary, arch, platform }) {
  const go = await io.which('go', false);
  if (!go) {
    throw new Error(
      `s3deploy has no prebuilt binary for ${platform}/${arch}. Add actions/setup-go before this step, or set go-fallback: false.`,
    );
  }
  const gobin = await tempDir('s3deploy-gobin-');
  const pkg = `github.com/bep/s3deploy/v2@v${version}`;
  core.info(`Building ${pkg} with go install`);
  await exec.exec(go, ['install', `-ldflags=-X=main.tag=v${version}`, pkg], {
    env: { ...process.env, GOBIN: gobin },
  });
  await io.mkdirP(gobin);
  const cached = await tc.cacheDir(gobin, TOOL, version, arch);
  core.notice(
    `s3deploy ${version} was built from source with go install: no prebuilt binary for ${platform}/${arch}. ` +
      'Release checksums do not apply; the Go module checksum database still does.',
  );
  return cached;
}

// Returns { path, dir, method, cacheHit }.
export async function install({
  version,
  baseUrl,
  usePreinstalled,
  goFallback,
  platform = process.platform,
  arch = process.arch,
}) {
  const binary = binaryName(platform);

  if (usePreinstalled) {
    const found = await io.which(binary, false);
    if (found) {
      const v = await reportedVersion(found);
      if (v === version) {
        core.info(`Using preinstalled ${found} (${v})`);
        return { path: found, dir: path.dirname(found), method: 'preinstalled', cacheHit: false };
      }
      core.info(`Preinstalled ${found} reports ${v ?? 'an unknown version'}, not ${version}; installing instead.`);
    } else {
      core.info(`use-preinstalled is set but ${binary} is not on PATH; installing instead.`);
    }
  }

  const hit = tc.find(TOOL, version, arch);
  if (hit) {
    core.info(`Found s3deploy ${version} in the tool cache: ${hit}`);
    return { path: path.join(hit, binary), dir: hit, method: 'cache', cacheHit: true };
  }

  const token = platformToken(platform, arch);
  let asset = null;
  if (token) {
    const sumsUrl = `${baseUrl}/v${version}/${checksumsFileName(version)}`;
    core.info(`Downloading ${sumsUrl}`);
    const sums = await readFile(await tc.downloadTool(sumsUrl), 'utf8');
    asset = resolveAsset(sums, version, token);
    if (!asset) core.info(`No ${token} archive listed in ${checksumsFileName(version)}.`);
  }

  let dir;
  let method;
  if (asset) {
    dir = await fromRelease({ version, baseUrl, asset, binary, arch });
    method = 'release';
  } else {
    if (!goFallback) {
      throw new Error(`s3deploy ${version} has no prebuilt binary for ${platform}/${arch} and go-fallback is false.`);
    }
    dir = await fromGo({ version, binary, arch, platform });
    method = 'go-install';
  }
  return { path: path.join(dir, binary), dir, method, cacheHit: false };
}
