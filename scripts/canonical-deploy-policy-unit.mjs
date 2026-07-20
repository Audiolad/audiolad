#!/usr/bin/env node

import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const commonSh = join(repoRoot, "deploy/scripts/lib/common.sh");
const policySh = join(repoRoot, "deploy/scripts/lib/canonical-deploy-policy.sh");
const deploySh = join(repoRoot, "deploy/scripts/deploy.sh");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runBash(scriptBody, { env = {}, cwd = repoRoot, timeoutMs = 30000 } = {}) {
  const result = spawnSync("bash", ["-lc", scriptBody], {
    cwd,
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

function sourcePolicy(envExtra = {}) {
  const gitWorkdir = envExtra.GIT_WORKDIR ?? repoRoot;
  const canonicalRef = envExtra.CANONICAL_REF ?? "origin/main";
  return `
    source "${commonSh}"
    source "${policySh}"
    GIT_WORKDIR="${gitWorkdir}"
    CANONICAL_REF="${canonicalRef}"
  `;
}

function initMockGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "audiolad-canonical-policy-"));
  runBash(
    `
      set -euo pipefail
      git init -q
      git config user.email "test@audiolad.local"
      git config user.name "Policy Test"
      echo base > README.md
      git add README.md
      git commit -q -m "base"
      git branch -M main
      git commit --allow-empty -q -m "canonical-head"
      CANONICAL_HEAD=$(git rev-parse HEAD)
      git commit --allow-empty -q -m "newer-not-deployed"
      NEWER=$(git rev-parse HEAD)
      git reset --hard HEAD~1
      echo "$CANONICAL_HEAD" > .canonical-head
      echo "$NEWER" > .outside-sha
    `,
    { cwd: dir },
  );

  const canonicalHead = readFileSync(join(dir, ".canonical-head"), "utf8").trim();
  const outsideSha = readFileSync(join(dir, ".outside-sha"), "utf8").trim();
  return { dir, canonicalHead, outsideSha };
}

function testMissingShaRejected() {
  const result = runBash(
    `
      ${sourcePolicy()}
      status=0
      validate_deploy_commit_argument "" || status=$?
      exit "$status"
    `,
  );
  assert(result.status !== 0, `missing SHA should fail: ${result.output}`);
  assert(result.output.includes("commit SHA is required"), result.output);
}

function testDeployScriptRequiresArgument() {
  const result = runBash(`bash "${deploySh}" 2>&1 || true`, { timeoutMs: 5000 });
  assert(
    result.output.includes("commit SHA is required") || result.output.includes("<commit-sha>"),
    result.output,
  );
}

function testCanonicalShaAccepted(mock) {
  const result = runBash(
    `
      ${sourcePolicy({ GIT_WORKDIR: mock.dir, CANONICAL_REF: "main" })}
      CANONICAL_REF=main
      if ! run_deploy_policy_gate "${mock.canonicalHead}"; then
        exit 1
      fi
      test "$DEPLOY_FULL_COMMIT" = "${mock.canonicalHead}"
    `,
  );
  assert(result.status === 0, `canonical SHA should pass: ${result.output}`);
}

function testOutsideShaRejected(mock) {
  const result = runBash(
    `
      ${sourcePolicy({ GIT_WORKDIR: mock.dir, CANONICAL_REF: "main" })}
      CANONICAL_REF=main
      if run_deploy_policy_gate "${mock.outsideSha}"; then
        echo should_not_pass
        exit 9
      fi
      exit 0
    `,
  );
  assert(result.status === 0, result.output);
  assert(result.output.includes("not reachable"), result.output);
  assert(!result.output.includes("should_not_pass"), result.output);
}

function testOverrideWithoutReasonRejected(mock) {
  const result = runBash(
    `
      ${sourcePolicy({ GIT_WORKDIR: mock.dir, CANONICAL_REF: "main" })}
      CANONICAL_REF=main
      export AUDIOLAD_DEPLOY_OVERRIDE=1
      unset AUDIOLAD_DEPLOY_OVERRIDE_REASON
      if run_deploy_policy_gate "${mock.outsideSha}"; then
        echo should_not_pass
        exit 9
      fi
      exit 0
    `,
  );
  assert(result.status === 0, result.output);
  assert(result.output.includes("AUDIOLAD_DEPLOY_OVERRIDE_REASON"), result.output);
}

function testOverrideWithReasonSkipsAncestorCheck(mock) {
  const result = runBash(
    `
      ${sourcePolicy({ GIT_WORKDIR: mock.dir, CANONICAL_REF: "main" })}
      CANONICAL_REF=main
      export AUDIOLAD_DEPLOY_OVERRIDE=1
      export AUDIOLAD_DEPLOY_OVERRIDE_REASON="emergency hotfix validation"
      run_deploy_policy_gate "${mock.outsideSha}"
    `,
  );
  assert(result.status === 0, `override with reason should pass policy gate: ${result.output}`);
  assert(result.output.includes("OVERRIDE ACTIVE"), result.output);
}

function testAncestorDirection(mock) {
  const good = runBash(
    `
      cd "${mock.dir}"
      git merge-base --is-ancestor "${mock.canonicalHead}" main && echo ok
    `,
  );
  assert(good.output.includes("ok"), "canonical head must be ancestor of main");

  const bad = runBash(
    `
      cd "${mock.dir}"
      if git merge-base --is-ancestor "${mock.outsideSha}" main; then
        echo wrong_direction
      else
        echo rejected
      fi
    `,
  );
  assert(bad.output.includes("rejected"), "outside SHA must not be ancestor of main");
}

function testDirtyWorkdirWarningDoesNotBlock() {
  const dirtyDir = mkdtempSync(join(tmpdir(), "audiolad-policy-dirty-"));
  runBash(
    `
      set -euo pipefail
      git init -q
      git config user.email "test@audiolad.local"
      git config user.name "Policy Test"
      echo clean > tracked.txt
      git add tracked.txt
      git commit -q -m "init"
      git branch -M main
      echo dirty >> tracked.txt
      echo untracked > local-only.txt
    `,
    { cwd: dirtyDir },
  );

  const head = runBash(`cd "${dirtyDir}" && git rev-parse HEAD`, { cwd: dirtyDir }).stdout.trim();

  const result = runBash(
    `
      ${sourcePolicy({ GIT_WORKDIR: dirtyDir, CANONICAL_REF: "main" })}
      CANONICAL_REF=main
      run_deploy_policy_gate "${head}"
    `,
  );
  assert(result.status === 0, result.output);
  assert(result.output.includes("dirty"), result.output);
  assert(result.output.includes("git archive"), result.output);

  const archiveCheck = runBash(
    `
      cd "${dirtyDir}"
      git archive "${head}" | tar -t | grep -q '^tracked.txt$'
    `,
    { cwd: dirtyDir },
  );
  assert(archiveCheck.status === 0, "archive must come from commit, not dirty tree");

  const hasLocalOnly = runBash(
    `
      cd "${dirtyDir}"
      if git archive "${head}" | tar -t | grep -q '^local-only.txt$'; then
        echo found
      fi
    `,
    { cwd: dirtyDir },
  );
  assert(!hasLocalOnly.stdout.includes("found"), "untracked file must not be archived");
}

function testMetadataFormatter() {
  const releaseDir = mkdtempSync(join(tmpdir(), "audiolad-policy-meta-"));
  const result = runBash(
    `
      ${sourcePolicy()}
      write_deploy_metadata \\
        "${releaseDir}" \\
        "abc123def456" \\
        "canonical999" \\
        "0" \\
        "" \\
        "tester"
      cat "${releaseDir}/.deploy-metadata"
    `,
  );
  assert(result.status === 0, result.output);
  assert(result.output.includes("commit=abc123def456"), result.output);
  assert(result.output.includes("canonical_ref=origin/main"), result.output);
  assert(result.output.includes("override=0"), result.output);
  assert(!result.output.includes("SUPABASE"), "metadata must not echo secrets");
  assert(!result.output.includes("PASSWORD"), result.output);
}

function main() {
  const mock = initMockGitRepo();
  try {
    testMissingShaRejected();
    testDeployScriptRequiresArgument();
    testCanonicalShaAccepted(mock);
    testOutsideShaRejected(mock);
    testOverrideWithoutReasonRejected(mock);
    testOverrideWithReasonSkipsAncestorCheck(mock);
    testAncestorDirection(mock);
    testDirtyWorkdirWarningDoesNotBlock();
    testMetadataFormatter();
    console.log("canonical-deploy-policy-unit: all tests passed");
  } finally {
    rmSync(mock.dir, { recursive: true, force: true });
  }
}

main();
