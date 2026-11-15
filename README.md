# s3deploy action

A GitHub Action that installs [bep/s3deploy](https://github.com/bep/s3deploy) on the runner and, unless told otherwise, runs it.

- Works on GitHub-hosted and self-hosted runners on Linux, macOS and Windows.
- Installs the published release binary and checks it against the release's checksums file; a mismatch fails the run.
- Builds with `go install` only on platforms upstream publishes no binary for.
- Has no input per s3deploy flag, so a new s3deploy flag never needs a new release of this action. Configure s3deploy with `S3DEPLOY_*` env vars, the `args` input, or your own `.s3deploy.yml`.

The default s3deploy version is the one pinned in [`s3deploy-version/go.mod`](s3deploy-version/go.mod)
(currently `2.16.0`). Dependabot bumps it when bep/s3deploy publishes a release; pass `version` to pin your own.

## Usage

Credentials first, then this action. The action doesn't handle AWS auth: run
[`aws-actions/configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials) (or anything else that
sets the standard `AWS_*` env vars or a profile) **before** it, and s3deploy picks the credentials up through the AWS SDK.

```yaml
permissions:
  id-token: write   # for OIDC
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v6
    with:
      role-to-assume: ${{ vars.AWS_ROLE_ARN }}
      aws-region: us-east-1

  - uses: ksell8/s3-deploy@v1
    env:
      S3DEPLOY_BUCKET: ${{ vars.BUCKET }}
      S3DEPLOY_SOURCE: _site
      S3DEPLOY_PATH: trans-game/
    with:
      args: -distribution-id ${{ vars.CF_DIST_ID }}
```

Install only, then call it yourself:

```yaml
  - uses: ksell8/s3-deploy@v1
    with:
      install-only: true
  - run: s3deploy -try -v
```

## Configuring s3deploy

s3deploy reads every flag from an environment variable named `S3DEPLOY_` plus the flag name in upper case
(`-bucket` → `S3DEPLOY_BUCKET`, `-distribution-id` → `S3DEPLOY_DISTRIBUTION_ID`). Precedence, highest first:

1. command-line flags (the `args` input),
2. `S3DEPLOY_*` environment variables (`env:` on the step),
3. `.s3deploy.yml` (or the file named by `-config`). The config file expands `${VAR}` from the environment.

`args` is split like a command line on every OS: spaces separate arguments, double quotes group them
(`-ignore "^drafts/.*"`), and line breaks count as spaces, so a YAML block can hold one flag per line.
A flag that can be repeated (`-distribution-id`, `-ignore`) can be given more than once in `args`.

See `s3deploy -h` or the [s3deploy README](https://github.com/bep/s3deploy#readme) for all flags.

## Inputs

| Input | Default | Description |
|---|---|---|
| `version` | from `s3deploy-version/go.mod` | s3deploy version, with or without the `v`. Always an exact version; `latest` and ranges are rejected. |
| `args` | `""` | Extra arguments passed straight to s3deploy. |
| `install-only` | `false` | Install and add to `PATH`, but don't run. |
| `download-base-url` | `https://github.com/bep/s3deploy/releases/download` | Where release assets come from. The action appends `/v<version>/<asset>`. |
| `use-preinstalled` | `false` | If an `s3deploy` on `PATH` reports the requested version, use it and download nothing. |
| `go-fallback` | `true` | Allow `go install` on platforms with no release binary. If `false`, fail there instead. |

## Outputs

| Output | Description |
|---|---|
| `path` | Absolute path to the `s3deploy` (or `s3deploy.exe`) binary. |
| `version` | Version reported by `s3deploy -V`. |
| `cache-hit` | `true` if the binary came from the tool cache. |
| `install-method` | `release`, `go-install`, `preinstalled` or `cache`. |

## Platforms

Upstream publishes binaries only for the first three rows (checked against the v2.16.0 release).

| Runner (`runner.os` / `runner.arch`) | Upstream asset | How it's installed |
|---|---|---|
| Linux / X64 | `s3deploy_<ver>_linux-amd64.tar.gz` | Release binary |
| macOS / X64 or ARM64 | `s3deploy_<ver>_darwin-universal.tar.gz` | Release binary |
| Windows / X64 | `s3deploy_<ver>_windows-amd64.zip` (`s3deploy.exe`) | Release binary |
| Linux / ARM64, Linux / ARM, Windows / ARM64, anything else | none | `go install` fallback |

The asset is found through the release's `s3deploy_<ver>_checksums.txt`, which also supplies its SHA-256, so
archive names and extensions aren't hard-coded. If a platform has no archive listed there, the action falls back
to `go install`.

**Go fallback.** Go must already be on `PATH`; the action never installs Go. Add
[`actions/setup-go`](https://github.com/actions/setup-go) before this step:

```yaml
  - uses: actions/setup-go@v7
    with:
      go-version: stable
  - uses: ksell8/s3-deploy@v1
    with:
      install-only: true
```

The action runs `go install github.com/bep/s3deploy/v2@v<version>` and caches the result like a release binary.
Release checksums don't apply to a source build (the Go module checksum database still does); the action prints a
notice when this happens. Set `go-fallback: false` to fail instead.

## Self-hosted runners

- **No `sudo`, no system paths.** The binary goes into the runner's tool cache (`RUNNER_TOOL_CACHE`), keyed by version
  and architecture. If `RUNNER_TOOL_CACHE`/`RUNNER_TEMP` aren't set, the action uses directories under the OS temp dir.
- **Persistent tool cache.** Self-hosted runners keep the tool cache between jobs, so after the first job every run is a
  cache hit (`cache-hit: true`) and downloads nothing.
- **Concurrent runners.** The binary is extracted into a temporary directory and then copied into the cache, and the
  cache entry only counts once it is complete, so a half-written binary is never put on `PATH`.
- **Nothing to shell out to.** Downloading, checksum verification and extraction are done in JavaScript, so the runner
  doesn't need `bash`, `curl`, `tar`, `unzip`, `sha256sum` or PowerShell. The only programs the action starts are
  `s3deploy` itself and, for the fallback, `go`.
- **Proxies.** `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` are honoured for downloads.
- **Restricted egress or GHES.** Point `download-base-url` at a mirror (Artifactory, Nexus, or any HTTP server) that
  serves the same layout as the GitHub release: `<base>/v<version>/s3deploy_<version>_checksums.txt` and the archives.
  For air-gapped runners with s3deploy baked into the image, set `use-preinstalled: true`. On GitHub Enterprise Server,
  this action itself must be made available through GitHub Connect or `actions-sync`.

## Development

```sh
npm ci
npm test        # unit tests (Vitest), including an end-to-end install against a local HTTP server
npm run build   # bundles src/ into dist/ with ncc; commit dist/
```

CI fails if `dist/` doesn't match a fresh build. The CI workflow also installs on Linux, macOS, Windows and Linux
ARM64 (Go fallback), checks the cache hit and `use-preinstalled`, checks that a missing Go and a corrupted checksum
fail, and deploys to a local S3 server (moto).

### Releasing

Tag `vX.Y.Z` and publish a GitHub release for it; the `Move major tag` workflow then points `vX` at it.
A new s3deploy version only changes the default `version` (a minor or patch release here). Only an incompatible
change to this action's own inputs or outputs is a new major version.
Dependabot keeps everything current: the default s3deploy version (`gomod` on `s3deploy-version/go.mod`; the action
reads that file at run time, so no rebuild of `dist/` is needed and the PR's CI tests the new version), npm packages,
and the actions used in CI. Nothing in `s3deploy-version/` is built; `tools.go` only keeps `go mod tidy` from
dropping the requirement.

## License

MIT
