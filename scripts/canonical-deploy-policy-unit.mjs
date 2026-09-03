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
const runFromTargetShaSh = join(repoRoot, "deploy/scripts/run-from-target-sha.sh");
const policyDeployRoot = mkdtempSync(join(tmpdir(), "audiolad-policy-deploy-root-"));

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
  const deployRoot = envExtra.DEPLOY_ROOT ?? policyDeployRoot;
  return `
    source "${commonSh}"
    source "${policySh}"
    GIT_WORKDIR="${gitWorkdir}"
    CANONICAL_REF="${canonicalRef}"
    DEPLOY_ROOT="${deployRoot}"
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
      git branch production "$CANONICAL_HEAD"
      git checkout -q production
      git commit --allow-empty -q -m "published-seo-change"
      PRODUCTION_HEAD=$(git rev-parse HEAD)
      git checkout -q main
      git checkout -q -b integrated-production
      git merge --no-ff -q production -m "integrate production changes"
      INTEGRATED_HEAD=$(git rev-parse HEAD)
      git checkout -q main
      git commit --allow-empty -q -m "newer-not-deployed"
      NEWER=$(git rev-parse HEAD)
      git reset --hard -q HEAD~1
      echo "$CANONICAL_HEAD" > .canonical-head
      echo "$PRODUCTION_HEAD" > .production-head
      echo "$INTEGRATED_HEAD" > .integrated-head
      echo "$NEWER" > .outside-sha
    `,
    { cwd: dir },
  );

  const canonicalHead = readFileSync(join(dir, ".canonical-head"), "utf8").trim();
  const productionHead = readFileSync(join(dir, ".production-head"), "utf8").trim();
  const integratedHead = readFileSync(join(dir, ".integrated-head"), "utf8").trim();
  const outsideSha = readFileSync(join(dir, ".outside-sha"), "utf8").trim();
  return { dir, canonicalHead, productionHead, integratedHead, outsideSha };
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

function configureActiveProductionRelease(mock) {
  const deployRoot = mkdtempSync(join(tmpdir(), "audiolad-active-production-"));
  const releaseDir = join(deployRoot, "releases", "published-seo-release");
  runBash(
    `
      set -euo pipefail
      mkdir -p "${releaseDir}"
      printf '%s\\n' "${mock.productionHead}" > "${releaseDir}/.deploy-commit"
      ln -s "${releaseDir}" "${deployRoot}/current"
    `,
  );
  return deployRoot;
}

function testStaleCandidateCannotReplaceActiveProduction(mock) {
  const deployRoot = configureActiveProductionRelease(mock);
  try {
    const result = runBash(
      `
        ${sourcePolicy({ GIT_WORKDIR: mock.dir, CANONICAL_REF: "main", DEPLOY_ROOT: deployRoot })}
        if run_deploy_policy_gate "${mock.canonicalHead}"; then
          echo should_not_pass
          exit 9
        fi
        exit 0
      `,
    );
    assert(result.status === 0, result.output);
    assert(result.output.includes("Active production ancestry guard rejected"), result.output);
    assert(result.output.includes(mock.productionHead), result.output);
    assert(!result.output.includes("should_not_pass"), result.output);
  } finally {
    rmSync(deployRoot, { recursive: true, force: true });
  }
}

function testOverrideCannotBypassActiveProductionGuard(mock) {
  const deployRoot = configureActiveProductionRelease(mock);
  try {
    const result = runBash(
      `
        ${sourcePolicy({ GIT_WORKDIR: mock.dir, CANONICAL_REF: "main", DEPLOY_ROOT: deployRoot })}
        export AUDIOLAD_DEPLOY_OVERRIDE=1
        export AUDIOLAD_DEPLOY_OVERRIDE_REASON="emergency hotfix validation"
        if run_deploy_policy_gate "${mock.canonicalHead}"; then
          echo should_not_pass
          exit 9
        fi
        exit 0
      `,
    );
    assert(result.status === 0, result.output);
    assert(result.output.includes("Active production ancestry guard rejected"), result.output);
    assert(!result.output.includes("OVERRIDE ACTIVE"), result.output);
    assert(!result.output.includes("should_not_pass"), result.output);
  } finally {
    rmSync(deployRoot, { recursive: true, force: true });
  }
}

function testIntegratedCandidateCanReplaceActiveProduction(mock) {
  const deployRoot = configureActiveProductionRelease(mock);
  try {
    const result = runBash(
      `
        ${sourcePolicy({ GIT_WORKDIR: mock.dir, CANONICAL_REF: "integrated-production", DEPLOY_ROOT: deployRoot })}
        run_deploy_policy_gate "${mock.integratedHead}"
      `,
    );
    assert(result.status === 0, result.output);
    assert(result.output.includes("Active production ancestry guard OK"), result.output);
  } finally {
    rmSync(deployRoot, { recursive: true, force: true });
  }
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

function writeFixtureDeployScripts(dir, { zeroDowntimeMarker, includeCaCerts, deployEcho }) {
  const caLine = includeCaCerts
    ? '        NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/ca-certificates.crt",'
    : "# no NODE_EXTRA_CA_CERTS";
  runBash(
    `
      set -euo pipefail
      mkdir -p deploy/scripts/lib deploy/systemd deploy/logrotate
      cat > deploy/scripts/deploy.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
echo "FIXTURE_DEPLOY_ECHO=${deployEcho}"
echo "PINNED=\${AUDIOLAD_DEPLOY_SCRIPTS_PINNED:-0}"
echo "PINNED_SHA=\${AUDIOLAD_DEPLOY_SCRIPTS_PINNED_SHA:-}"
if grep -q 'NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/ca-certificates.crt"' "\$DIR/lib/zero-downtime.sh"; then
  echo "TARGET_HAS_NODE_EXTRA_CA_CERTS"
fi
if grep -q 'MARKER_STALE_ZERO_DOWNTIME' "\$DIR/lib/zero-downtime.sh"; then
  echo "USING_STALE_ZERO_DOWNTIME"
fi
if grep -q 'MARKER_TARGET_ZERO_DOWNTIME' "\$DIR/lib/zero-downtime.sh"; then
  echo "USING_TARGET_ZERO_DOWNTIME"
fi
EOF
      chmod +x deploy/scripts/deploy.sh
      cat > deploy/scripts/lib/zero-downtime.sh <<EOF
# ${zeroDowntimeMarker}
${caLine}
EOF
      cp "${runFromTargetShaSh}" deploy/scripts/run-from-target-sha.sh
      chmod +x deploy/scripts/run-from-target-sha.sh
      : > deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.service
      : > deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.timer
      : > deploy/logrotate/audiolad-author-appreciation-getcourse-reconcile
    `,
    { cwd: dir },
  );
}

function initStaleLaunchWorktree() {
  const dir = mkdtempSync(join(tmpdir(), "audiolad-pin-workdir-"));
  runBash(
    `
      set -euo pipefail
      git init -q
      git config user.email "test@audiolad.local"
      git config user.name "Pin Test"
      echo base > README.md
      git add README.md
      git commit -q -m "base"
      git branch -M main
    `,
    { cwd: dir },
  );

  writeFixtureDeployScripts(dir, {
    zeroDowntimeMarker: "MARKER_STALE_ZERO_DOWNTIME",
    includeCaCerts: false,
    deployEcho: "STALE_WORKTREE",
  });
  runBash(
    `
      set -euo pipefail
      git add deploy/scripts deploy/systemd deploy/logrotate
      git commit -q -m "stale-deploy-scripts"
    `,
    { cwd: dir },
  );
  const staleSha = runBash("git rev-parse HEAD", { cwd: dir }).stdout.trim();

  writeFixtureDeployScripts(dir, {
    zeroDowntimeMarker: "MARKER_TARGET_ZERO_DOWNTIME",
    includeCaCerts: true,
    deployEcho: "TARGET_SHA",
  });
  runBash(
    `
      set -euo pipefail
      git add deploy/scripts deploy/systemd deploy/logrotate
      git commit -q -m "target-deploy-scripts"
    `,
    { cwd: dir },
  );
  const targetSha = runBash("git rev-parse HEAD", { cwd: dir }).stdout.trim();

  runBash(`git checkout -q "${staleSha}"`, { cwd: dir });
  runBash(
    `
      set -euo pipefail
      mkdir -p deploy/scripts
      echo staged-workaround > deploy/scripts/stale-staged.sh
      git add deploy/scripts/stale-staged.sh
    `,
    { cwd: dir },
  );

  return { dir, staleSha, targetSha };
}

function testTargetShaDeployLogicNotLaunchWorktree() {
  const mock = initStaleLaunchWorktree();
  const deployRoot = mkdtempSync(join(tmpdir(), "audiolad-pin-deploy-root-"));
  try {
    const headBefore = runBash("git rev-parse HEAD", { cwd: mock.dir }).stdout.trim();
    assert(headBefore === mock.staleSha, "launch worktree must start at stale SHA");

    const stagedBefore = runBash("git diff --cached --name-only", { cwd: mock.dir }).stdout;
    assert(stagedBefore.includes("deploy/scripts/stale-staged.sh"), "staged deploy file present");

    const result = runBash(
      `
        export GIT_WORKDIR="${mock.dir}"
        export DEPLOY_ROOT="${deployRoot}"
        bash "${runFromTargetShaSh}" "${mock.targetSha}"
      `,
    );
    assert(result.status === 0, `target-SHA bootstrap should run fixture deploy: ${result.output}`);
    assert(result.output.includes("FIXTURE_DEPLOY_ECHO=TARGET_SHA"), result.output);
    assert(result.output.includes("USING_TARGET_ZERO_DOWNTIME"), result.output);
    assert(result.output.includes("TARGET_HAS_NODE_EXTRA_CA_CERTS"), result.output);
    assert(!result.output.includes("FIXTURE_DEPLOY_ECHO=STALE_WORKTREE"), result.output);
    assert(!result.output.includes("USING_STALE_ZERO_DOWNTIME"), result.output);
    assert(result.output.includes(`PINNED=1`), result.output);
    assert(result.output.includes(`PINNED_SHA=${mock.targetSha}`), result.output);
    assert(
      !result.output.includes("Reusing pinned deploy scripts"),
      `first launch must take the fresh archive branch: ${result.output}`,
    );

    const headAfter = runBash("git rev-parse HEAD", { cwd: mock.dir }).stdout.trim();
    assert(headAfter === mock.staleSha, "bootstrap must not checkout/reset GIT_WORKDIR HEAD");
    const stagedAfter = runBash("git diff --cached --name-only", { cwd: mock.dir }).stdout;
    assert(
      stagedAfter.includes("deploy/scripts/stale-staged.sh"),
      "bootstrap must not clear staged worktree files",
    );

    const viaShow = runBash(
      `
        export GIT_WORKDIR="${mock.dir}"
        export DEPLOY_ROOT="${deployRoot}"
        git -C "${mock.dir}" show "${mock.targetSha}:deploy/scripts/run-from-target-sha.sh" \
          | bash -s -- "${mock.targetSha}"
      `,
    );
    assert(viaShow.status === 0, `git show | bash -s should work: ${viaShow.output}`);
    assert(viaShow.output.includes("USING_TARGET_ZERO_DOWNTIME"), viaShow.output);
    assert(viaShow.output.includes("TARGET_HAS_NODE_EXTRA_CA_CERTS"), viaShow.output);
    assert(
      viaShow.output.includes("Reusing pinned deploy scripts"),
      `second launch must take the reuse branch: ${viaShow.output}`,
    );

    const viaDeploySh = runBash(
      `
        export GIT_WORKDIR="${mock.dir}"
        export DEPLOY_ROOT="${deployRoot}"
        bash "${deploySh}" "${mock.targetSha}"
      `,
    );
    assert(viaDeploySh.status === 0, `deploy.sh must re-exec target SHA scripts: ${viaDeploySh.output}`);
    assert(viaDeploySh.output.includes("USING_TARGET_ZERO_DOWNTIME"), viaDeploySh.output);
    assert(viaDeploySh.output.includes("TARGET_HAS_NODE_EXTRA_CA_CERTS"), viaDeploySh.output);
    assert(!viaDeploySh.output.includes("USING_STALE_ZERO_DOWNTIME"), viaDeploySh.output);

    const currentLaunch = runBash(
      `
        set -euo pipefail
        mkdir -p "${deployRoot}/releases/fake-current/deploy/scripts"
        cp "${deploySh}" "${deployRoot}/releases/fake-current/deploy/scripts/deploy.sh"
        ln -sfn "${deployRoot}/releases/fake-current" "${deployRoot}/current"
        export GIT_WORKDIR="${mock.dir}"
        export DEPLOY_ROOT="${deployRoot}"
        export AUDIOLAD_DEPLOY_SCRIPTS_PINNED=1
        bash "${deployRoot}/current/deploy/scripts/deploy.sh" "${mock.targetSha}"
      `,
    );
    assert(currentLaunch.status !== 0, "pinned exec via /current must fail");
    assert(currentLaunch.output.includes("/current"), currentLaunch.output);
  } finally {
    rmSync(mock.dir, { recursive: true, force: true });
    rmSync(deployRoot, { recursive: true, force: true });
  }
}

function testScriptsOnlyPinCacheIsRejected() {
  const mock = initStaleLaunchWorktree();
  const deployRoot = mkdtempSync(join(tmpdir(), "audiolad-pin-scripts-only-"));
  try {
    const dest = join(deployRoot, "shared/deploy-scripts", mock.targetSha);
    runBash(
      `
        set -euo pipefail
        mkdir -p "${dest}/deploy/scripts"
        printf '%s\\n' "${mock.targetSha}" > "${dest}/deploy/scripts/.pinned-commit"
        cat > "${dest}/deploy/scripts/deploy.sh" <<'EOF'
#!/usr/bin/env bash
echo "FIXTURE_DEPLOY_ECHO=SCRIPTS_ONLY_STALE"
exit 0
EOF
        chmod +x "${dest}/deploy/scripts/deploy.sh"
        echo leftover > "${dest}/.scripts-only-marker"
      `,
    );

    const result = runBash(
      `
        export GIT_WORKDIR="${mock.dir}"
        export DEPLOY_ROOT="${deployRoot}"
        bash "${runFromTargetShaSh}" "${mock.targetSha}"
      `,
    );
    assert(result.status === 0, `scripts-only cache must re-archive: ${result.output}`);
    assert(
      !result.output.includes("Reusing pinned deploy scripts"),
      `scripts-only pin must not reuse: ${result.output}`,
    );
    assert(result.output.includes("FIXTURE_DEPLOY_ECHO=TARGET_SHA"), result.output);
    assert(!result.output.includes("FIXTURE_DEPLOY_ECHO=SCRIPTS_ONLY_STALE"), result.output);

    const leftover = runBash(
      `
        if [[ -f "${dest}/.scripts-only-marker" ]]; then
          echo leftover_present
        fi
        test -f "${dest}/deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.service"
        test -f "${dest}/deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.timer"
        test -f "${dest}/deploy/logrotate/audiolad-author-appreciation-getcourse-reconcile"
      `,
    );
    assert(leftover.status === 0, leftover.output);
    assert(!leftover.stdout.includes("leftover_present"), "scripts-only dest must be replaced");
  } finally {
    rmSync(mock.dir, { recursive: true, force: true });
    rmSync(deployRoot, { recursive: true, force: true });
  }
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
    testStaleCandidateCannotReplaceActiveProduction(mock);
    testOverrideCannotBypassActiveProductionGuard(mock);
    testIntegratedCandidateCanReplaceActiveProduction(mock);
    testDirtyWorkdirWarningDoesNotBlock();
    testTargetShaDeployLogicNotLaunchWorktree();
    testScriptsOnlyPinCacheIsRejected();
    testMetadataFormatter();
    console.log("canonical-deploy-policy-unit: all tests passed");
  } finally {
    rmSync(mock.dir, { recursive: true, force: true });
    rmSync(policyDeployRoot, { recursive: true, force: true });
  }
}

main();
