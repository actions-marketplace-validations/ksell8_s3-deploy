//go:build tools

// Package tools only exists so `go mod tidy` (which Dependabot runs) keeps
// the s3deploy requirement in go.mod. It is never built.
package tools

import _ "github.com/bep/s3deploy/v2/lib"
