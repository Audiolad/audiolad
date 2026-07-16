#!/usr/bin/env bash
# Block Playwright/E2E on production. Source from bash smoke wrappers.
set -Eeuo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$_SCRIPT_DIR/guard-playwright.mjs"
