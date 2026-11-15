import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { argStringToArray } from './args.js';
import { ensureRunnerDirs, install, reportedVersion } from './install.js';
import { normalizeVersion } from './platform.js';

export async function run() {
  try {
    ensureRunnerDirs();
    const version = normalizeVersion(core.getInput('version', { required: true }));
    const baseUrl = core.getInput('download-base-url', { required: true }).replace(/\/+$/, '');
    const installOnly = core.getBooleanInput('install-only');
    const usePreinstalled = core.getBooleanInput('use-preinstalled');
    const goFallback = core.getBooleanInput('go-fallback');
    const args = core.getInput('args');

    const result = await install({ version, baseUrl, usePreinstalled, goFallback });
    core.addPath(result.dir);

    const reported = await reportedVersion(result.path);
    if (reported !== version) {
      core.warning(`Requested s3deploy ${version} but the binary reports ${reported ?? 'no version'}.`);
    }
    core.info(`s3deploy ${reported ?? '(unknown version)'} ready at ${result.path} (${result.method})`);

    core.setOutput('path', result.path);
    core.setOutput('version', reported ?? '');
    core.setOutput('cache-hit', String(result.cacheHit));
    core.setOutput('install-method', result.method);

    if (!installOnly) {
      // S3DEPLOY_* and AWS_* from the step's env are inherited.
      await exec.exec(result.path, argStringToArray(args));
    }
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}
