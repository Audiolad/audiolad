#!/usr/bin/env node

import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const commonSh = join(repoRoot, "deploy/scripts/lib/common.sh");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runLockTest(scriptBody, { env = {}, timeoutMs = 15000 } = {}) {
  const result = spawnSync("bash", ["-lc", scriptBody], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: timeoutMs,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function testFreeLockAcquires() {
  const lockFile = join(mkdtempSync(join(tmpdir(), "audiolad-deploy-lock-")), "deploy.lock");
  const result = runLockTest(
    `
      source "${commonSh}"
      DEPLOY_LOCK_FILE="${lockFile}"
      acquire_deploy_lock
      echo acquired_ok
    `,
  );

  assert(result.status === 0, `free lock should acquire: ${result.output}`);
  assert(result.output.includes("acquired_ok"), "expected acquired_ok marker");
}

function testParallelSecondProcessRejected() {
  const lockFile = join(mkdtempSync(join(tmpdir(), "audiolad-deploy-lock-")), "deploy.lock");
  const result = runLockTest(
    `
      source "${commonSh}"
      DEPLOY_LOCK_FILE="${lockFile}"
      (
        source "${commonSh}"
        DEPLOY_LOCK_FILE="${lockFile}"
        acquire_deploy_lock
        sleep 20
      ) &
      holder=$!
      sleep 1
      if acquire_deploy_lock; then
        echo should_not_acquire
        kill "$holder" 2>/dev/null || true
        exit 9
      fi
      kill "$holder" 2>/dev/null || true
      wait "$holder" 2>/dev/null || true
      exit 1
    `,
    { timeoutMs: 10000 },
  );

  assert(result.status === 1, `parallel acquire should fail: ${result.output}`);
  assert(
    result.output.includes("Another Audiolad deploy or rollback is already running."),
    `expected lock message: ${result.output}`,
  );
  assert(!result.output.includes("should_not_acquire"), "second process must not acquire lock");
}

function testLockReleasedAfterExit() {
  const lockDir = mkdtempSync(join(tmpdir(), "audiolad-deploy-lock-"));
  const lockFile = join(lockDir, "deploy.lock");

  const first = runLockTest(
    `
      source "${commonSh}"
      DEPLOY_LOCK_FILE="${lockFile}"
      acquire_deploy_lock
      echo first_ok
    `,
  );
  assert(first.status === 0, `first acquire failed: ${first.output}`);

  const second = runLockTest(
    `
      source "${commonSh}"
      DEPLOY_LOCK_FILE="${lockFile}"
      acquire_deploy_lock
      echo second_ok
    `,
  );

  rmSync(lockDir, { recursive: true, force: true });

  assert(second.status === 0, `second acquire after release failed: ${second.output}`);
  assert(second.output.includes("second_ok"), "expected second_ok marker");
}

function testSharedLockForDeployAndRollbackPaths() {
  const lockFile = join(mkdtempSync(join(tmpdir(), "audiolad-deploy-lock-")), "deploy.lock");

  const deployPath = runLockTest(
    `
      source "${commonSh}"
      DEPLOY_LOCK_FILE="${lockFile}"
      (
        source "${commonSh}"
        DEPLOY_LOCK_FILE="${lockFile}"
        acquire_deploy_lock
        sleep 20
      ) &
      holder=$!
      sleep 1
      if acquire_deploy_lock; then
        echo rollback_should_not_acquire
        kill "$holder" 2>/dev/null || true
        exit 9
      fi
      kill "$holder" 2>/dev/null || true
      wait "$holder" 2>/dev/null || true
      exit 1
    `,
    { timeoutMs: 10000 },
  );

  assert(deployPath.status === 1, `rollback path should be blocked: ${deployPath.output}`);
  assert(
    deployPath.output.includes("Another Audiolad deploy or rollback is already running."),
    `expected shared lock rejection: ${deployPath.output}`,
  );
  assert(
    !deployPath.output.includes("rollback_should_not_acquire"),
    "rollback should not acquire while deploy holds lock",
  );
}

function testTrustedInternalRollbackBypass() {
  const lockDir = mkdtempSync(join(tmpdir(), "audiolad-deploy-lock-"));
  const lockFile = join(lockDir, "deploy.lock");
  const fakeDeploy = join(lockDir, "deploy.sh");
  writeFileSync(
    fakeDeploy,
    `#!/usr/bin/env bash
set -Eeuo pipefail
source "${commonSh}"
DEPLOY_LOCK_FILE="${lockFile}"
acquire_deploy_lock
AUDIOLAD_DEPLOY_LOCK_HELD=1 bash -lc '
  source "${commonSh}"
  DEPLOY_LOCK_FILE="${lockFile}"
  acquire_deploy_lock
  echo internal_rollback_ok
'
`,
  );
  chmodSync(fakeDeploy, 0o755);

  const trusted = spawnSync("bash", [fakeDeploy], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10000,
  });

  rmSync(lockDir, { recursive: true, force: true });

  assert(trusted.status === 0, `trusted internal bypass failed: ${trusted.stdout}${trusted.stderr}`);
  assert(
    `${trusted.stdout}`.includes("internal_rollback_ok"),
    "expected internal rollback success marker",
  );
}

function testUntrustedBypassRejected() {
  const lockFile = join(mkdtempSync(join(tmpdir(), "audiolad-deploy-lock-")), "deploy.lock");
  const result = runLockTest(
    `
      source "${commonSh}"
      DEPLOY_LOCK_FILE="${lockFile}"
      AUDIOLAD_DEPLOY_LOCK_HELD=1 acquire_deploy_lock
    `,
  );

  assert(result.status === 1, `untrusted bypass should fail: ${result.output}`);
  assert(
    result.output.includes("Deploy lock bypass rejected"),
    `expected bypass rejection: ${result.output}`,
  );
}

const tests = [
  ["free lock acquires", testFreeLockAcquires],
  ["parallel second process rejected", testParallelSecondProcessRejected],
  ["lock released after exit", testLockReleasedAfterExit],
  ["shared lock for deploy and rollback", testSharedLockForDeployAndRollbackPaths],
  ["trusted internal rollback bypass", testTrustedInternalRollbackBypass],
  ["untrusted bypass rejected", testUntrustedBypassRejected],
];

for (const [name, run] of tests) {
  run();
  console.log(`ok: ${name}`);
}

console.log(`deploy-lock-unit: ${tests.length} tests passed`);
