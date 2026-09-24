#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const commonSh = join(repoRoot, "deploy/scripts/lib/common.sh");
const deploySh = join(repoRoot, "deploy/scripts/deploy.sh");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runBash(script) {
  const result = spawnSync("bash", ["-lc", script], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function testThreshold(availMb, expectedStatus, expectedExit) {
  const result = runBash(`
    source "${commonSh}"
    set +e
    status="$(disk_space_guard_status ${availMb})"
    code=$?
    printf '%s %s\\n' "$status" "$code"
  `);
  assert(result.status === 0, `guard helper crashed for ${availMb}: ${result.output}`);
  assert(
    result.output.trim() === `${expectedStatus} ${expectedExit}`,
    `${availMb}MB expected ${expectedStatus} ${expectedExit}, got ${result.output.trim()}`,
  );
}

testThreshold(12287, "reject", 1);
testThreshold(12288, "pass", 0);
testThreshold(20000, "pass", 0);

const defaultMb = runBash(`
  source "${commonSh}"
  printf '%s\\n' "$DEPLOY_MIN_FREE_MB"
`);
assert(defaultMb.output.trim() === "12288", `default threshold ${defaultMb.output}`);

const deployCall = runBash(`rg -n "check_disk_space" "${deploySh}"`);
assert(deployCall.output.includes('check_disk_space "$DEPLOY_MIN_FREE_MB"'), deployCall.output);
assert(!deployCall.output.includes("2048"), deployCall.output);

const message = runBash(`
  source "${commonSh}"
  DEPLOY_ROOT=/tmp
  df() { printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n/dev/sda1 1 1 1048576 99%% /\\n'; }
  set +e
  check_disk_space
  printf 'exit=%s\\n' $?
`);
assert(message.status === 1, message.output);
assert(message.output.includes("1024MB available, need at least 12288MB"), message.output);

console.log("deploy-disk-space-guard-unit: ok");
