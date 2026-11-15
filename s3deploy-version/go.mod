// The default s3deploy version used by this action.
//
// The action reads the github.com/bep/s3deploy/v2 version below at run time
// (when the `version` input is empty), and CI tests against it. Dependabot's
// gomod updater bumps it when bep/s3deploy publishes a release, so a
// Dependabot PR changes the default and its CI run tests the new version.
// Nothing here is built.
module github.com/ksell8/s3-deploy/s3deploy-version

go 1.25.0

require github.com/bep/s3deploy/v2 v2.16.0
