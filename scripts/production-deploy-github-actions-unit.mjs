#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = join(repoRoot, ".github/workflows/production-deploy.yml");
const wrapperPath = join(repoRoot, "deploy/scripts/github-actions-deploy-wrapper.sh");
const docsPath = join(repoRoot, "docs/production-deploy-github-actions.md");
const studioDiagnosePath = join(
  repoRoot,
  "deploy/scripts/audiolad-studio-render-worker-env-diagnose.sh",
);
const studioRecoverPath = join(
  repoRoot,
  "deploy/scripts/audiolad-studio-render-worker-recover.sh",
);
const diskAuditPath = join(
  repoRoot,
  "deploy/scripts/audiolad-disk-storage-audit.sh",
);
const diskCleanupPath = join(
  repoRoot,
  "deploy/scripts/audiolad-disk-storage-cleanup.sh",
);
const studioDupAssetDiagPath = join(
  repoRoot,
  "deploy/scripts/audiolad-studio-duplicate-asset-diag.sh",
);
const courseUpgradeDiagPath = join(
  repoRoot,
  "deploy/scripts/audiolad-course-upgrade-diag.sh",
);
const courseUpgradeLogdiagPath = join(
  repoRoot,
  "deploy/scripts/audiolad-course-upgrade-logdiag.sh",
);
const courseUpgradeLogdiagSudoersPath = join(
  repoRoot,
  "deploy/sudoers/audiolad-course-upgrade-logdiag",
);
const SHA40 = "a".repeat(40);

function parseYaml(text) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sys, yaml
data = yaml.safe_load(sys.stdin.read())
if True in data and "on" not in data:
    data["on"] = data.pop(True)
print(json.dumps(data))
`,
    ],
    { input: text, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `YAML parse failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function runWrapper(args) {
  return spawnSync("bash", [wrapperPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 8000,
    env: {
      ...process.env,
      GIT_WORKDIR: "/tmp/should-not-be-used",
      DEPLOY_ROOT: "/tmp/should-not-be-used",
      AUDIOLAD_DEPLOY_OVERRIDE: "1",
      AUDIOLAD_DEPLOY_OVERRIDE_REASON: "unit-test-must-not-reach-git",
    },
  });
}

function extractFencedBash(markdown) {
  const blocks = [];
  const re = /```bash\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(markdown))) {
    blocks.push(match[1]);
  }
  return blocks;
}

function assertBootstrapCreatesAuthorizedKeysBeforeChown(docsText) {
  const blocks = extractFencedBash(docsText);
  const bootstrap = blocks.find(
    (block) => block.includes("authorized_keys") && /chown\b/.test(block),
  );
  assert.ok(bootstrap, "docs must contain a pasteable bootstrap bash block");
  assert.match(
    bootstrap,
    /: "\$\{DEPLOY_GHA_PUBKEY:/,
    "bootstrap must fail closed when DEPLOY_GHA_PUBKEY is empty",
  );

  let created = false;
  for (const rawLine of bootstrap.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("#") || line.length === 0) {
      continue;
    }
    if (
      /printf\b/.test(line) &&
      /DEPLOY_GHA_PUBKEY/.test(line) &&
      /authorized_keys/.test(line)
    ) {
      created = true;
    }
    if (/chown\b/.test(line) && /authorized_keys/.test(line)) {
      assert.ok(
        created,
        "bootstrap must create authorized_keys from DEPLOY_GHA_PUBKEY before chown; commented-out create + live chown is forbidden",
      );
    }
  }
  assert.ok(created, "bootstrap must write authorized_keys from DEPLOY_GHA_PUBKEY");
}

function assertRejectsBeforeGit(args, label) {
  const result = runWrapper(args);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert.notEqual(result.status, 0, `${label}: expected non-zero exit`);
  assert.match(output, /exactly one argument|40-character lowercase hex SHA/i, `${label}: expected usage/reject`);
  assert.doesNotMatch(output, /Fetching origin|fatal:|git -C|requested SHA:/, `${label}: must fail before git`);
}

function main() {
  const workflowText = readFileSync(workflowPath, "utf8");
  const wrapperText = readFileSync(wrapperPath, "utf8");
  const docsText = readFileSync(docsPath, "utf8");
  const workflow = parseYaml(workflowText);
  const combined = `${workflowText}\n${wrapperText}`;
  const combinedCode = combined
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"], "on must be workflow_dispatch only");
  assert.equal(Object.hasOwn(workflow.on, "push"), false, "no on.push");
  assert.equal(workflow.on.push, undefined, "on.push must be absent");
  assert.equal(workflow.on.pull_request, undefined, "no on.pull_request");
  assert.equal(workflow.on.pull_request_target, undefined, "no on.pull_request_target");
  assert.equal(workflow.on.schedule, undefined, "no on.schedule");
  assert.doesNotMatch(workflowText, /^\s+push:/m, "raw YAML must not declare on.push");

  assert.equal(workflow.concurrency.group, "production-deploy");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);

  assert.equal(workflow.permissions.contents, "read");
  assert.equal(Object.keys(workflow.permissions).join(","), "contents");

  const jobs = workflow.jobs;
  assert.ok(jobs.resolve, "job resolve must exist");
  assert.ok(jobs.deploy, "job deploy must exist");
  assert.ok(jobs.diagnose, "job diagnose must exist");
  assert.ok(jobs.studio_worker_recover, "job studio_worker_recover must exist");
  assert.ok(jobs.disk_storage_audit, "job disk_storage_audit must exist");
  assert.ok(jobs.disk_storage_cleanup, "job disk_storage_cleanup must exist");
  assert.ok(jobs.studio_duplicate_asset_diag, "job studio_duplicate_asset_diag must exist");
  assert.ok(jobs.course_upgrade_diag, "job course_upgrade_diag must exist");
  assert.equal(jobs.deploy.environment, "production");
  assert.equal(jobs.diagnose.environment, "production");
  assert.equal(jobs.studio_worker_recover.environment, "production");
  assert.equal(jobs.disk_storage_audit.environment, "production");
  assert.equal(jobs.disk_storage_cleanup.environment, "production");
  assert.equal(jobs.studio_duplicate_asset_diag.environment, "production");
  assert.equal(jobs.course_upgrade_diag.environment, "production");
  assert.equal(jobs.deploy["runs-on"], "ubuntu-latest");
  assert.equal(jobs.diagnose["runs-on"], "ubuntu-latest");
  assert.equal(jobs.studio_worker_recover["runs-on"], "ubuntu-latest");
  assert.equal(jobs.disk_storage_audit["runs-on"], "ubuntu-latest");
  assert.equal(jobs.disk_storage_cleanup["runs-on"], "ubuntu-latest");
  assert.equal(jobs.studio_duplicate_asset_diag["runs-on"], "ubuntu-latest");
  assert.equal(jobs.course_upgrade_diag["runs-on"], "ubuntu-latest");
  assert.match(workflowText, /if: inputs\.confirm == 'DO_NOT_DEPLOY'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_STUDIO_WORKER_RECOVER'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_DISK_STORAGE_AUDIT'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_DISK_STORAGE_CLEANUP'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_STUDIO_DUPLICATE_ASSET_DIAG'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_COURSE_UPGRADE_DIAG'/);
  assert.match(workflowText, /if: inputs\.confirm == 'DEPLOY'/);
  assert.match(workflowText, /audiolad_deploy=NOT_INVOKED/);
  assert.doesNotMatch(workflowText, /if: \$\{\{ inputs\.confirm \}\} != "DEPLOY"/);

  assert.doesNotMatch(combinedCode, /StrictHostKeyChecking=no/);
  assert.match(workflowText, /StrictHostKeyChecking=yes/);
  assert.doesNotMatch(combinedCode, /git reset --hard/);
  assert.doesNotMatch(combinedCode, /AUDIOLAD_DEPLOY_OVERRIDE=1/);
  assert.match(wrapperText, /^set -euo pipefail$/m);
  assert.match(wrapperText, /unset AUDIOLAD_DEPLOY_OVERRIDE/);
  assert.match(wrapperText, /unset SSH_CLIENT/);
  assert.doesNotMatch(workflowText, /SendEnv/);
  assert.doesNotMatch(combined, /topics_catalog_counts/);
  assert.doesNotMatch(combined, /playwright/i);
  assert.doesNotMatch(combined, /deploy\/scripts\/production-smoke-http/);
  assert.doesNotMatch(
    wrapperText,
    /\/var\/www\/audiolad-deploy\/current\/deploy\/scripts/,
    "wrapper must not launch via /current",
  );
  assert.doesNotMatch(workflowText, /\/current\/deploy\/scripts/);
  assert.match(combined, new RegExp(String.raw`\[0-9a-f\]\{40\}`));
  assert.match(wrapperText, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflowText, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflowText, /\/usr\/local\/sbin\/audiolad-deploy/);
  assert.match(workflowText, /sudo -n \/usr\/local\/sbin\/audiolad-deploy/);
  assert.match(wrapperText, /GIT_WORKDIR=\/var\/www\/audiolad-clean/);
  assert.match(wrapperText, /DEPLOY_ROOT=\/var\/www\/audiolad-deploy/);
  assert.match(wrapperText, /run-from-target-sha\.sh/);
  assert.doesNotMatch(combinedCode, /\brsync\b/);
  assert.doesNotMatch(wrapperText, /\bnpm\b/);
  const recoverJobStartForTrue = workflowText.indexOf("name: Ops Studio worker recover");
  const deployJobStartForTrue = workflowText.indexOf("name: Deploy to production");
  const workflowWithoutRecover =
    recoverJobStartForTrue >= 0 && deployJobStartForTrue > recoverJobStartForTrue
      ? workflowText.slice(0, recoverJobStartForTrue) + workflowText.slice(deployJobStartForTrue)
      : workflowText;
  const combinedWithoutRecover = `${workflowWithoutRecover}\n${wrapperText}`
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(
    combinedWithoutRecover,
    /\|\| true/,
    "DEPLOY / diagnose / wrapper must not use || true; recover may use pm2 delete || true",
  );

  const confirm = workflow.on.workflow_dispatch.inputs.confirm;
  assert.equal(confirm.required, true);
  assert.equal(confirm.type, "choice");
  assert.ok(confirm.options.includes("DEPLOY"), "confirm options must include DEPLOY");
  assert.ok(confirm.options.includes("DO_NOT_DEPLOY"), "confirm options must include DO_NOT_DEPLOY");
  assert.ok(
    confirm.options.includes("OPS_STUDIO_WORKER_RECOVER"),
    "confirm options must include OPS_STUDIO_WORKER_RECOVER",
  );
  assert.ok(
    confirm.options.includes("OPS_DISK_STORAGE_AUDIT"),
    "confirm options must include OPS_DISK_STORAGE_AUDIT",
  );
  assert.ok(
    confirm.options.includes("OPS_DISK_STORAGE_CLEANUP"),
    "confirm options must include OPS_DISK_STORAGE_CLEANUP",
  );
  assert.ok(
    confirm.options.includes("OPS_STUDIO_DUPLICATE_ASSET_DIAG"),
    "confirm options must include OPS_STUDIO_DUPLICATE_ASSET_DIAG",
  );
  assert.ok(
    confirm.options.includes("OPS_COURSE_UPGRADE_DIAG"),
    "confirm options must include OPS_COURSE_UPGRADE_DIAG",
  );

  const syntax = spawnSync("bash", ["-n", wrapperPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `wrapper bash -n failed: ${syntax.stderr}`);

  chmodSync(wrapperPath, 0o755);
  assertRejectsBeforeGit([], "no args");
  assertRejectsBeforeGit([SHA40, "extra"], "extra args");
  assertRejectsBeforeGit(["main"], "branch name");
  assertRejectsBeforeGit(["abc"], "short sha");
  assertRejectsBeforeGit(["A".repeat(40)], "uppercase sha");
  assertRejectsBeforeGit(["--help"], "flag");
  assertRejectsBeforeGit([`${SHA40};reboot`], "metacharacters");
  assertRejectsBeforeGit([`$(${SHA40})`], "command substitution");

  assert.match(
    docsText,
    /deploy ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/audiolad-deploy/,
  );
  assertBootstrapCreatesAuthorizedKeysBeforeChown(docsText);
  assert.match(docsText, /ssh-keygen -lf \/etc\/ssh\/ssh_host_ed25519_key\.pub/);
  assert.match(docsText, /ssh-keyscan/);
  assert.match(
    docsText,
    /ssh-keyscan[\s\S]{0,400}ssh-keygen -lf \/etc\/ssh\/ssh_host_ed25519_key\.pub|fingerprint[\s\S]{0,400}ssh_host_ed25519_key\.pub|ssh_host_ed25519_key\.pub[\s\S]{0,400}fingerprint|отпечаток[\s\S]{0,400}ssh-keyscan|ssh-keyscan[\s\S]{0,500}совпасть/,
    "docs must require fingerprint verification of ssh-keyscan vs /etc/ssh/ssh_host_ed25519_key.pub",
  );
  const docsBash = extractFencedBash(docsText).join("\n");
  assert.doesNotMatch(docsBash, /StrictHostKeyChecking=no/);
  assert.match(docsText, /StrictHostKeyChecking=yes/);

  const validationOffset = wrapperText.indexOf("^[0-9a-f]{40}$");
  const gitOffset = wrapperText.indexOf("git -C");
  assert.ok(validationOffset >= 0 && gitOffset > validationOffset, "SHA validation must precede git");

  const targetShowNeedle = 'git -C "$GIT_WORKDIR" show "${SHA}:deploy/scripts/run-from-target-sha.sh"';
  const ancestorOffset = wrapperText.indexOf("merge-base --is-ancestor");
  const targetShowOffset = wrapperText.indexOf(targetShowNeedle);
  assert.ok(ancestorOffset >= 0, "wrapper must call merge-base --is-ancestor");
  assert.ok(targetShowOffset >= 0, "wrapper must launch via target-SHA git show");
  assert.ok(
    ancestorOffset < targetShowOffset,
    "wrapper must verify origin/main ancestry before the first target-controlled git show",
  );
  assert.match(workflowText, /merge-base --is-ancestor/);
  assert.doesNotMatch(wrapperText, /AUDIOLAD_DEPLOY_OVERRIDE=1/);

  const courseUpgradeJobMarker = workflowText.indexOf("name: Ops course upgrade diagnostic");
  const deployJobMarkerForCheckout = workflowText.indexOf("name: Deploy to production");
  assert.ok(
    courseUpgradeJobMarker >= 0 && deployJobMarkerForCheckout > courseUpgradeJobMarker,
    "course-upgrade diag job must precede deploy job",
  );
  const courseUpgradeJobYaml = workflowText.slice(courseUpgradeJobMarker, deployJobMarkerForCheckout);
  assert.doesNotMatch(
    workflowText,
    /actions\/checkout/,
    "production-deploy must not use actions/checkout",
  );
  assert.doesNotMatch(
    courseUpgradeJobYaml,
    /actions\/checkout/,
    "course_upgrade_diag must not use actions/checkout",
  );
  assert.doesNotMatch(courseUpgradeJobYaml, /persist-credentials/);
  assert.match(
    courseUpgradeJobYaml,
    /ORIGIN_MAIN_SHA:\s+\$\{\{\s*needs\.resolve\.outputs\.origin_main_sha\s*\}\}/,
  );
  assert.doesNotMatch(workflowText, /git submodule/);
  assert.doesNotMatch(workflowText, /\bgit checkout\b/);
  assert.doesNotMatch(workflowText, /\bgit clone\b/);
  assert.doesNotMatch(workflowText, /\bgit worktree\b/);
  const workflowFetchLines = workflowText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && /\bgit\b/.test(line) && /\bfetch\b/.test(line));
  assert.equal(workflowFetchLines.length, 1, "workflow must fetch exactly once");
  assert.match(workflowFetchLines[0], /fetch --no-tags origin \+refs\/heads\/main:refs\/remotes\/origin\/main/);
  assert.doesNotMatch(workflowFetchLines[0], /refs\/heads\/(?!main\b)/);
  assert.match(workflowText, /ORIGIN_MAIN_SHA="\$\(git -C "\$\{OBJECT_STORE\}" rev-parse refs\/remotes\/origin\/main\)"/);
  assert.match(workflowText, /TARGET_SHA="\$\{ORIGIN_MAIN_SHA\}"/);

  const resolveStepOffset = workflowText.indexOf("name: Resolve target SHA");
  const workflowAncestorOffset = workflowText.indexOf("merge-base --is-ancestor");
  const sshStepOffset = workflowText.indexOf("name: Deploy via SSH wrapper");
  const diagnoseStepOffset = workflowText.indexOf("name: Read-only reconcile diagnostics via SSH");
  const diskAuditStepOffset = workflowText.indexOf("name: Read-only disk/Storage audit via SSH");
  const diskCleanupStepOffset = workflowText.indexOf("name: One-shot allowlist disk/Storage cleanup via SSH");
  const dupAssetDiagStepOffset = workflowText.indexOf(
    "name: Read-only Studio duplicate asset diagnostic via SSH",
  );
  const courseUpgradeDiagStepOffset = workflowText.indexOf(
    "name: Read-only course upgrade diagnostic via SSH",
  );
  assert.ok(resolveStepOffset >= 0, "workflow must resolve the target SHA");
  assert.ok(
    workflowAncestorOffset > resolveStepOffset,
    "workflow ancestry check must live in the resolve step",
  );
  assert.ok(
    sshStepOffset > workflowAncestorOffset,
    "workflow must verify origin/main ancestry before SSH deploy",
  );
  assert.ok(
    diagnoseStepOffset > workflowAncestorOffset,
    "workflow must verify origin/main ancestry before SSH diagnostics",
  );
  assert.ok(
    diskAuditStepOffset > workflowAncestorOffset,
    "workflow must verify origin/main ancestry before SSH disk/Storage audit",
  );
  assert.ok(
    diskCleanupStepOffset > workflowAncestorOffset,
    "workflow must verify origin/main ancestry before SSH disk/Storage cleanup",
  );
  assert.ok(
    dupAssetDiagStepOffset > workflowAncestorOffset,
    "workflow must verify origin/main ancestry before SSH Studio duplicate asset diagnostic",
  );
  assert.ok(
    courseUpgradeDiagStepOffset > workflowAncestorOffset,
    "workflow must verify origin/main ancestry before SSH course-upgrade diagnostic",
  );

  assertStudioRenderWorkerEnvDiagnostic(workflowText, docsText);
  assertRemoteDiagnoseScriptSyntax(workflowText);
  assertStudioDiagnoseHelper();
  assertStudioRenderWorkerRecover(workflowText, docsText);
  assertRemoteRecoverScriptSyntax(workflowText);
  assertStudioRecoverHelper();
  assertDiskStorageAudit(workflowText, docsText);
  assertRemoteDiskAuditScriptSyntax(workflowText);
  assertDiskAuditHelper();
  assertDiskStorageCleanup(workflowText, docsText);
  assertRemoteDiskCleanupScriptSyntax(workflowText);
  assertDiskCleanupHelper(workflowText);
  assertStudioDuplicateAssetDiag(workflowText, docsText);
  assertRemoteStudioDupAssetDiagScriptSyntax(workflowText);
  assertStudioDupAssetDiagHelper(workflowText);
  assertCourseUpgradeDiag(workflowText, docsText, workflow);
  assertCourseUpgradeDiagHelper();
  assertCourseUpgradeHelperFetchTransport(workflow);

  console.log("production-deploy-github-actions-unit: all tests passed");
}

function extractRemoteDiagnoseScript(workflowText) {
  const start = workflowText.indexOf("<<'REMOTE'\n");
  const end = workflowText.indexOf("\n          REMOTE\n", start);
  assert.ok(start >= 0 && end > start, "diagnose job must contain a REMOTE heredoc");
  return workflowText
    .slice(start + "<<'REMOTE'\n".length, end)
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n");
}

function assertStudioRenderWorkerEnvDiagnostic(workflowText, docsText) {
  const required = [
    "STUDIO_RENDER_WORKER_ENV_DIAGNOSTIC",
    "STUDIO_RENDER_WORKER_CURRENT_RELEASE",
    "CURRENT RELEASE=",
    'diagnose_env_path "CURRENT_ENV_PRODUCTION"',
    'diagnose_env_path "CURRENT_ENV_LOCAL"',
    'diagnose_env_path "SHARED_ENV_PRODUCTION"',
    "STUDIO_RENDER_WORKER_NAMEI_CURRENT_ENV_PRODUCTION",
    "STUDIO_RENDER_WORKER_NAMEI_CURRENT_ENV_LOCAL",
    "STUDIO_RENDER_WORKER_NAMEI_SHARED_ENV_PRODUCTION",
    "STUDIO_RENDER_WORKER_DEPLOY_CAN_READ",
    "DEPLOY_CAN_READ_",
    "STUDIO_RENDER_WORKER_PM2",
    "STUDIO_RENDER_WORKER_PM2_DESCRIBE",
    "STUDIO_RENDER_WORKER_PM2_LOGS",
    'run_loadenv_probe "CWD"',
    "STUDIO_RENDER_WORKER_LOADENV_REALPATH",
    "HAS_NEXT_PUBLIC_SUPABASE_URL=",
    "HAS_SUPABASE_SERVICE_ROLE_KEY=",
    "STUDIO_RENDER_WORKER_SUDO_N_L",
    "loadEnvConfig(dir, false, silent, true)",
    "sudo -n -l",
    "namei -l",
    "realpath=BROKEN",
    "stat_owner=",
    "studio_render_env_ready|environment_missing|hasNextPublic|hasSupabase|redacted",
  ];
  for (const needle of required) {
    assert.match(
      workflowText,
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `diagnose workflow must contain ${needle}`,
    );
  }

  assert.match(workflowText, /unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflowText, /NODE_ENV=production/);
  assert.match(workflowText, /Divergent env variables/);
  assert.doesNotMatch(workflowText, /workflow_dispatch:[\s\S]*remote_command/);
  assert.doesNotMatch(workflowText, /inputs:[\s\S]*command:/);
  assert.doesNotMatch(
    workflowText,
    /cat\s+[^\n]*\.(env\.production|env\.local)/,
    "must not cat env files",
  );
  assert.doesNotMatch(
    workflowText,
    /head\s+[^\n]*\.(env\.production|env\.local)/,
    "must not head env files",
  );
  assert.match(
    workflowText,
    /sudo -n \/usr\/local\/sbin\/audiolad-deploy/,
  );
  const deployJob = workflowText.slice(workflowText.indexOf("name: Deploy to production"));
  assert.match(deployJob, /sudo -n \/usr\/local\/sbin\/audiolad-deploy/);
  assert.doesNotMatch(deployJob, /STUDIO_RENDER_WORKER_ENV_DIAGNOSTIC/);
  assert.match(docsText, /Studio render-worker env/);
  assert.match(docsText, /audiolad-studio-render-worker-env-diagnose\.sh/);
}

function assertRemoteDiagnoseScriptSyntax(workflowText) {
  const remote = extractRemoteDiagnoseScript(workflowText);
  const scriptPath = join(tmpdir(), `audiolad-diagnose-remote-${process.pid}.sh`);
  writeFileSync(scriptPath, remote);
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  rmSync(scriptPath, { force: true });
  assert.equal(syntax.status, 0, `remote diagnose bash -n failed: ${syntax.stderr}`);
}

function assertStudioDiagnoseHelper() {
  const helperText = readFileSync(studioDiagnosePath, "utf8");
  const syntax = spawnSync("bash", ["-n", studioDiagnosePath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `helper bash -n failed: ${syntax.stderr}`);
  assert.match(helperText, /STUDIO_RENDER_WORKER_ENV_DIAGNOSTIC/);
  assert.match(helperText, /loadEnvConfig\(dir, false, silent, true\)/);
  assert.doesNotMatch(helperText, /cat\s+[^\n]*\.(env\.production|env\.local)/);
  chmodSync(studioDiagnosePath, 0o755);

  const root = mkdtempSync(join(tmpdir(), "audiolad-studio-env-diagnose-"));
  const secretUrl = "https://env-bootstrap-test.example.invalid";
  const secretKey = "super-secret-service-role-key-do-not-log";
  const releaseName = "20260907-000000-testdiag";
  const releaseDir = join(root, "releases", releaseName);
  const sharedDir = join(root, "shared");
  const binDir = join(root, "bin");
  const outLog = join(root, "worker-out.log");
  const errLog = join(root, "worker-error.log");
  mkdirSync(releaseDir, { recursive: true });
  mkdirSync(join(releaseDir, "node_modules", "@next", "env"), { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    join(sharedDir, ".env.production"),
    `NEXT_PUBLIC_SUPABASE_URL=${secretUrl}\nSUPABASE_SERVICE_ROLE_KEY=${secretKey}\n`,
  );
  chmodSync(join(sharedDir, ".env.production"), 0o600);
  symlinkSync(join(sharedDir, ".env.production"), join(releaseDir, ".env.production"));
  symlinkSync(join(sharedDir, ".env.production"), join(releaseDir, ".env.local"));
  symlinkSync(releaseDir, join(root, "current"));
  writeFileSync(join(releaseDir, "package.json"), JSON.stringify({ name: "audiolad-fixture", private: true }));
  writeFileSync(
    join(releaseDir, "node_modules", "@next", "env", "package.json"),
    JSON.stringify({ name: "@next/env", main: "index.js" }),
  );
  writeFileSync(
    join(releaseDir, "node_modules", "@next", "env", "index.js"),
    [
      "const fs = require('fs');",
      "const path = require('path');",
      "function loadEnvConfig(dir) {",
      "  const file = path.join(dir, '.env.production');",
      "  const text = fs.readFileSync(file, 'utf8');",
      "  for (const line of text.split('\\n')) {",
      "    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);",
      "    if (m) process.env[m[1]] = m[2];",
      "  }",
      "}",
      "module.exports = { loadEnvConfig };",
      "",
    ].join("\n"),
  );
  writeFileSync(
    outLog,
    [
      `leaked ${secretKey} ${secretUrl}`,
      '{"event":"studio_render_env_ready","hasNextPublicSupabaseUrl":true,"hasSupabaseServiceRoleKey":true}',
      "unrelated noise",
      "",
    ].join("\n"),
  );
  writeFileSync(
    errLog,
    [
      `render_worker_environment_missing SUPABASE_SERVICE_ROLE_KEY=${secretKey} url=${secretUrl}`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "pm2-jlist.json"),
    JSON.stringify([
      {
        name: "audiolad-studio-render-worker",
        pm2_env: {
          status: "errored",
          restart_time: 7,
          unstable_restarts: 1,
          cron_restart: null,
          autorestart: true,
          pm_cwd: "/var/www/audiolad-deploy/current",
          pm_out_log_path: outLog,
          pm_err_log_path: errLog,
          env: { SUPABASE_SERVICE_ROLE_KEY: secretKey },
        },
      },
    ]),
  );
  writeFileSync(
    join(binDir, "pm2"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `JLIST=${JSON.stringify(join(root, "pm2-jlist.json"))}`,
      'if [[ "${1:-}" == "jlist" ]]; then',
      '  cat "${JLIST}"',
      'elif [[ "${1:-}" == "describe" ]]; then',
      "  echo '| status            | errored |'",
      "  echo '| restarts          | 7 |'",
      "  echo '| exec cwd          | /var/www/audiolad-deploy/current |'",
      "  echo 'Divergent env variables from local env'",
      `  echo 'SUPABASE_SERVICE_ROLE_KEY=${secretKey}'`,
      'elif [[ "${1:-}" == "status" ]]; then',
      "  echo 'audiolad-studio-render-worker errored'",
      "else",
      "  exit 1",
      "fi",
      "",
    ].join("\n"),
  );
  chmodSync(join(binDir, "pm2"), 0o755);

  try {
    const result = spawnSync("bash", [studioDiagnosePath], {
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        DEPLOY_ROOT: root,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `helper failed: ${output}`);
    assert.match(output, new RegExp(`CURRENT RELEASE=${releaseName}`));
    assert.match(output, /DEPLOY_CAN_READ_SHARED_ENV_PRODUCTION=YES/);
    assert.match(output, /DEPLOY_CAN_READ_CURRENT_ENV_PRODUCTION=YES/);
    assert.match(output, /HAS_NEXT_PUBLIC_SUPABASE_URL=true/);
    assert.match(output, /HAS_SUPABASE_SERVICE_ROLE_KEY=true/);
    assert.match(output, /studio_render_env_ready/);
    assert.match(output, /environment_missing/);
    assert.doesNotMatch(output, /unrelated noise/);
    assert.doesNotMatch(output, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, /NEXT_PUBLIC_SUPABASE_URL=https/);
    assert.match(output, /status=errored/);
    assert.match(output, /restarts=7/);
    assert.match(output, /cron_restart=none/);
    assert.match(output, /autorestart=True/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function extractRemoteRecoverScript(workflowText) {
  const start = workflowText.indexOf("<<'REMOTE_RECOVER'\n");
  const end = workflowText.indexOf("\n          REMOTE_RECOVER\n", start);
  assert.ok(start >= 0 && end > start, "recover job must contain a REMOTE_RECOVER heredoc");
  return workflowText
    .slice(start + "<<'REMOTE_RECOVER'\n".length, end)
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n");
}

function assertStudioRenderWorkerRecover(workflowText, docsText) {
  const required = [
    "OPS_STUDIO_WORKER_RECOVER",
    "STUDIO_RENDER_WORKER_RECOVER",
    "ENV PERMISSIONS =",
    "FRESH ENV READY LOG =",
    "ACTIVE RENDER JOBS BEFORE=",
    "WORKER CLEAN START =",
    "RESTART COUNT STABLE =",
    "SURVIVED >2.5 MIN =",
    "RENDER SMOKE =",
    "#353 PRODUCTION ACCEPTANCE =",
    "CUTOVER = ${CUTOVER}",
    "audiolad_deploy = ${AUDIOLAD_DEPLOY}",
    "CUTOVER=NO",
    "audiolad_deploy=NOT_INVOKED",
    "RENDER_SMOKE=PASS",
    "pm2 delete audiolad-studio-render-worker || true",
    "recover_stale_studio_render_jobs",
    "CUTOVER=NO",
    "unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY",
    "deploy/studio-render-worker.ecosystem.config.cjs",
    "studio_render_env_ready",
    "hasNextPublicSupabaseUrl",
    "hasSupabaseServiceRoleKey",
    "save_log_offsets",
    "tail -c \"+$((offset + 1))\"",
    "pm2 save",
    "SELECT count(*) FROM public.studio_render_jobs WHERE status IN ('queued', 'processing')",
    "loadEnvConfig(dir, false, silent, true)",
  ];
  for (const needle of required) {
    assert.match(
      workflowText,
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `recover workflow must contain ${needle}`,
    );
  }

  const recoverStart = workflowText.indexOf("name: Ops Studio worker recover");
  const auditStart = workflowText.indexOf("name: Ops disk/Storage audit");
  const deployStart = workflowText.indexOf("name: Deploy to production");
  assert.ok(recoverStart >= 0 && deployStart > recoverStart, "recover job must precede deploy job");
  assert.ok(auditStart > recoverStart && deployStart > auditStart, "audit job must sit between recover and deploy");
  const recoverJob = workflowText.slice(recoverStart, auditStart);
  const diagnoseJob = workflowText.slice(
    workflowText.indexOf("name: Production read-only diagnostics"),
    recoverStart,
  );
  assert.doesNotMatch(
    recoverJob,
    /sudo -n \/usr\/local\/sbin\/audiolad-deploy/,
    "recover job must not invoke audiolad-deploy",
  );
  assert.doesNotMatch(recoverJob, /\bdeploy\.sh\b/, "recover job must not call deploy.sh");
  assert.match(
    recoverJob,
    /pm2 delete audiolad-studio-render-worker \|\| true/,
    "recover must delete the worker with || true only after the jobs==0 gate",
  );
  assert.match(
    recoverJob,
    /pm2 start deploy\/studio-render-worker\.ecosystem\.config\.cjs/,
  );
  assert.doesNotMatch(recoverJob, /\bnginx\b/, "recover job must not touch nginx");
  const recoverCode = recoverJob
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(
    recoverCode,
    /\bsource\s+[^\n]*\.(env\.production|env\.local)/,
    "recover job must not source env files",
  );
  assert.doesNotMatch(
    recoverJob,
    /cat\s+[^\n]*\.(env\.production|env\.local)/,
    "recover job must not cat env files",
  );
  assert.doesNotMatch(diagnoseJob, /pm2 delete/, "diagnose job must stay read-only");
  assert.doesNotMatch(diagnoseJob, /OPS_STUDIO_WORKER_RECOVER/);
  assert.doesNotMatch(diagnoseJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(recoverJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(diagnoseJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(recoverJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.match(docsText, /OPS_STUDIO_WORKER_RECOVER/);
  assert.match(docsText, /audiolad-studio-render-worker-recover\.sh/);
  assert.doesNotMatch(recoverJob, /pm2 flush/, "recover must not flush PM2 logs");
  assert.doesNotMatch(
    recoverJob,
    /tail -n 200/,
    "recover must not scan full historical tails for env ready",
  );
}

function assertRemoteRecoverScriptSyntax(workflowText) {
  const remote = extractRemoteRecoverScript(workflowText);
  const scriptPath = join(tmpdir(), `audiolad-recover-remote-${process.pid}.sh`);
  writeFileSync(scriptPath, remote);
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  rmSync(scriptPath, { force: true });
  assert.equal(syntax.status, 0, `remote recover bash -n failed: ${syntax.stderr}`);
}

function writeRecoverFixture(root, { jobCount = "0", envMode = 0o640, secretUrl, secretKey, onStartAppend = "ready" }) {
  const releaseName = "20260907-000000-testrecover";
  const releaseDir = join(root, "releases", releaseName);
  const sharedDir = join(root, "shared");
  const binDir = join(root, "bin");
  const outLog = join(root, "worker-out.log");
  const errLog = join(root, "worker-error.log");
  const startedMarker = join(root, "pm2-started");
  const deletedMarker = join(root, "pm2-deleted");
  const savedMarker = join(root, "pm2-saved");
  mkdirSync(releaseDir, { recursive: true });
  mkdirSync(join(releaseDir, "deploy"), { recursive: true });
  mkdirSync(join(releaseDir, "node_modules", "@next", "env"), { recursive: true });
  mkdirSync(join(releaseDir, "node_modules", "@supabase", "supabase-js"), { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    join(sharedDir, ".env.production"),
    `NEXT_PUBLIC_SUPABASE_URL=${secretUrl}\nSUPABASE_SERVICE_ROLE_KEY=${secretKey}\n`,
  );
  chmodSync(join(sharedDir, ".env.production"), envMode);
  symlinkSync(join(sharedDir, ".env.production"), join(releaseDir, ".env.production"));
  symlinkSync(releaseDir, join(root, "current"));
  writeFileSync(
    join(releaseDir, "deploy", "studio-render-worker.ecosystem.config.cjs"),
    "module.exports = { apps: [{ name: 'audiolad-studio-render-worker' }] };\n",
  );
  writeFileSync(
    join(releaseDir, "node_modules", "@next", "env", "package.json"),
    JSON.stringify({ name: "@next/env", main: "index.js" }),
  );
  writeFileSync(
    join(releaseDir, "node_modules", "@next", "env", "index.js"),
    [
      "const fs = require('fs');",
      "const path = require('path');",
      "function loadEnvConfig(dir) {",
      "  const file = path.join(dir, '.env.production');",
      "  const text = fs.readFileSync(file, 'utf8');",
      "  for (const line of text.split('\\n')) {",
      "    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);",
      "    if (m) process.env[m[1]] = m[2];",
      "  }",
      "}",
      "module.exports = { loadEnvConfig };",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(releaseDir, "node_modules", "@supabase", "supabase-js", "package.json"),
    JSON.stringify({ name: "@supabase/supabase-js", main: "index.js" }),
  );
  writeFileSync(
    join(releaseDir, "node_modules", "@supabase", "supabase-js", "index.js"),
    [
      "function createClient() {",
      "  return {",
      "    rpc() { return Promise.resolve({ data: null, error: null }); },",
      "    from() {",
      "      return {",
      "        select() { return this; },",
      "        in() {",
      "          return Promise.resolve({ count: 0, error: null });",
      "        },",
      "      };",
      "    },",
      "  };",
      "}",
      "module.exports = { createClient };",
      "",
    ].join("\n"),
  );
  writeFileSync(
    outLog,
    [
      `leaked ${secretKey} ${secretUrl}`,
      '{"event":"studio_render_env_ready","hasNextPublicSupabaseUrl":true,"hasSupabaseServiceRoleKey":true}',
      "historical ready must be ignored because it is before the saved offset",
      "",
    ].join("\n"),
  );
  writeFileSync(
    errLog,
    [
      '{"event":"render_worker_environment_missing","hasNextPublicSupabaseUrl":false,"hasSupabaseServiceRoleKey":false}',
      "historical missing must be ignored because it is before the saved offset",
      "",
    ].join("\n"),
  );
  const startAppendLine =
    onStartAppend === "missing"
      ? '{"event":"render_worker_environment_missing","hasNextPublicSupabaseUrl":false,"hasSupabaseServiceRoleKey":false}'
      : onStartAppend === "ready"
        ? '{"event":"studio_render_env_ready","hasNextPublicSupabaseUrl":true,"hasSupabaseServiceRoleKey":true}'
        : "";
  writeFileSync(
    join(root, "pm2-jlist.json"),
    JSON.stringify([
      {
        name: "audiolad-studio-render-worker",
        pid: 4242,
        pm2_env: {
          status: "online",
          restart_time: 0,
          pm_pid: 4242,
          pm_cwd: join(root, "current"),
          pm_out_log_path: outLog,
          pm_err_log_path: errLog,
          env: { SUPABASE_SERVICE_ROLE_KEY: secretKey },
        },
      },
    ]),
  );
  writeFileSync(
    join(binDir, "pm2"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `JLIST=${JSON.stringify(join(root, "pm2-jlist.json"))}`,
      `STARTED=${JSON.stringify(startedMarker)}`,
      `DELETED=${JSON.stringify(deletedMarker)}`,
      `SAVED=${JSON.stringify(savedMarker)}`,
      'if [[ "${1:-}" == "jlist" ]]; then',
      '  cat "${JLIST}"',
      'elif [[ "${1:-}" == "delete" ]]; then',
      '  : > "${DELETED}"',
      'elif [[ "${1:-}" == "start" ]]; then',
      '  : > "${STARTED}"',
      '  printf "%s\\n" "${2:-}" >> "${STARTED}"',
      startAppendLine
        ? `  printf '%s\\n' ${JSON.stringify(startAppendLine)} >> ${JSON.stringify(outLog)}`
        : "  true",
      'elif [[ "${1:-}" == "save" ]]; then',
      '  : > "${SAVED}"',
      "else",
      "  exit 1",
      "fi",
      "",
    ].join("\n"),
  );
  chmodSync(join(binDir, "pm2"), 0o755);
  writeFileSync(
    join(binDir, "docker"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `printf '%s\\n' ${JSON.stringify(jobCount)}`,
      "",
    ].join("\n"),
  );
  chmodSync(join(binDir, "docker"), 0o755);
  return {
    releaseName,
    binDir,
    startedMarker,
    deletedMarker,
    savedMarker,
    envFile: join(sharedDir, ".env.production"),
    outLog,
    errLog,
  };
}

function runRecoverHelper(root, binDir, extraEnv = {}) {
  return spawnSync("bash", [studioRecoverPath], {
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      DEPLOY_ROOT: root,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      AUDIOLAD_DOCKER_BIN: join(binDir, "docker"),
      AUDIOLAD_STUDIO_WORKER_SURVIVE_SECONDS: "0",
      AUDIOLAD_STUDIO_WORKER_ONLINE_TIMEOUT_SECONDS: "2",
      AUDIOLAD_STUDIO_WORKER_POLL_SECONDS: "0",
      AUDIOLAD_STUDIO_WORKER_ENV_BOOTSTRAP_SECONDS: "2",
      AUDIOLAD_STUDIO_WORKER_ENV_BOOTSTRAP_POLL_SECONDS: "1",
      ...extraEnv,
    },
  });
}

function assertStudioRecoverHelper() {
  const helperText = readFileSync(studioRecoverPath, "utf8");
  const syntax = spawnSync("bash", ["-n", studioRecoverPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `recover helper bash -n failed: ${syntax.stderr}`);
  assert.match(helperText, /STUDIO_RENDER_WORKER_RECOVER/);
  assert.match(helperText, /#353 PRODUCTION ACCEPTANCE/);
  assert.match(helperText, /RENDER_SMOKE=PASS/);
  assert.match(helperText, /ENV PERMISSIONS/);
  assert.match(helperText, /FRESH ENV READY LOG/);
  assert.match(helperText, /RESTART COUNT STABLE/);
  assert.match(helperText, /save_log_offsets/);
  assert.match(helperText, /tail -c "\+\$\(\(offset \+ 1\)\)"/);
  assert.match(helperText, /pm2 delete audiolad-studio-render-worker \|\| true/);
  assert.match(helperText, /unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(helperText, /\/usr\/local\/sbin\/audiolad-deploy/);
  assert.doesNotMatch(helperText, /sudo\s+-n/);
  assert.doesNotMatch(helperText, /pm2 flush/);
  assert.doesNotMatch(helperText, /tail -n 200/);
  const helperCode = helperText
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(helperCode, /\bsource\s+[^\n]*\.env\.production/);
  assert.doesNotMatch(helperText, /cat\s+[^\n]*\.(env\.production|env\.local)/);
  chmodSync(studioRecoverPath, 0o755);

  const secretUrl = "https://env-bootstrap-test.example.invalid";
  const secretKey = "super-secret-service-role-key-do-not-log";

  const happyRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-env-recover-"));
  try {
    const fixture = writeRecoverFixture(happyRoot, { secretUrl, secretKey });
    const result = runRecoverHelper(happyRoot, fixture.binDir);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `recover helper failed: ${output}`);
    assert.match(output, /DEPLOY CAN READ ENV = YES/);
    assert.match(output, /ENV PERMISSIONS = .*READ=YES/);
    assert.match(output, /ACTIVE RENDER JOBS BEFORE=0/);
    assert.match(output, /WORKER CLEAN START = YES/);
    assert.match(output, /FRESH ENV READY LOG = YES/);
    assert.match(output, /RESTART COUNT STABLE = YES/);
    assert.match(output, /SURVIVED >2\.5 MIN = YES/);
    assert.match(output, /RENDER SMOKE = PASS/);
    assert.match(output, /#353 PRODUCTION ACCEPTANCE = SUCCESS/);
    assert.match(output, /CUTOVER=NO/);
    assert.match(output, /CUTOVER = NO/);
    assert.match(output, /audiolad_deploy = NOT_INVOKED/);
    assert.match(output, /studio_render_env_ready/);
    assert.match(output, /WORKER PID=4242/);
    assert.doesNotMatch(output, /historical ready must be ignored/);
    assert.doesNotMatch(output, /historical missing must be ignored/);
    assert.doesNotMatch(output, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(existsSyncSafe(fixture.deletedMarker), "pm2 delete should run when worker exists");
    assert.ok(existsSyncSafe(fixture.startedMarker), "pm2 start should run");
    assert.ok(existsSyncSafe(fixture.savedMarker), "pm2 save should run after success");
    const outAfter = readFileSync(fixture.outLog, "utf8");
    const errAfter = readFileSync(fixture.errLog, "utf8");
    assert.match(outAfter, /historical ready must be ignored/, "must not truncate out log history");
    assert.match(errAfter, /render_worker_environment_missing/, "must not truncate error log history");
    assert.equal(
      (outAfter.match(/studio_render_env_ready/g) || []).length,
      2,
      "historical ready stays and a fresh ready line is appended",
    );
  } finally {
    rmSync(happyRoot, { recursive: true, force: true });
  }

  const busyRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-env-recover-busy-"));
  try {
    const fixture = writeRecoverFixture(busyRoot, { jobCount: "2", secretUrl, secretKey });
    const result = runRecoverHelper(busyRoot, fixture.binDir);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.notEqual(result.status, 0, "recover must abort when jobs > 0");
    assert.match(output, /ACTIVE RENDER JOBS BEFORE=2/);
    assert.match(output, /#353 PRODUCTION ACCEPTANCE = FAILED/);
    assert.equal(existsSyncSafe(fixture.deletedMarker), false, "must not delete worker when jobs > 0");
    assert.equal(existsSyncSafe(fixture.startedMarker), false, "must not start worker when jobs > 0");
  } finally {
    rmSync(busyRoot, { recursive: true, force: true });
  }

  const staleReadyRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-env-recover-stale-"));
  try {
    const fixture = writeRecoverFixture(staleReadyRoot, {
      secretUrl,
      secretKey,
      onStartAppend: "none",
    });
    const result = runRecoverHelper(staleReadyRoot, fixture.binDir);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.notEqual(result.status, 0, "historical ready before offset must not count as fresh");
    assert.match(output, /FRESH ENV READY LOG = NO/);
    assert.match(output, /#353 PRODUCTION ACCEPTANCE = FAILED/);
    assert.equal(existsSyncSafe(fixture.savedMarker), false, "must not pm2 save when fresh ready is missing");
    assert.match(
      readFileSync(fixture.outLog, "utf8"),
      /historical ready must be ignored/,
      "must not truncate historical ready lines",
    );
    assert.match(
      readFileSync(fixture.errLog, "utf8"),
      /render_worker_environment_missing/,
      "must not truncate historical missing lines",
    );
  } finally {
    rmSync(staleReadyRoot, { recursive: true, force: true });
  }

  const missingAfterRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-env-recover-missing-"));
  try {
    const fixture = writeRecoverFixture(missingAfterRoot, {
      secretUrl,
      secretKey,
      onStartAppend: "missing",
    });
    const result = runRecoverHelper(missingAfterRoot, fixture.binDir);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.notEqual(result.status, 0, "post-offset environment_missing must fail");
    assert.match(output, /FRESH ENV READY LOG = NO/);
    assert.match(output, /environment_missing \/ render_worker_environment_missing in post-offset bytes/);
    assert.match(output, /#353 PRODUCTION ACCEPTANCE = FAILED/);
    assert.equal(existsSyncSafe(fixture.savedMarker), false, "must not pm2 save after post-offset missing");
  } finally {
    rmSync(missingAfterRoot, { recursive: true, force: true });
  }

  if (process.getuid && process.getuid() !== 0) {
    const unreadRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-env-recover-unread-"));
    try {
      const fixture = writeRecoverFixture(unreadRoot, { envMode: 0o000, secretUrl, secretKey });
      const result = runRecoverHelper(unreadRoot, fixture.binDir);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      assert.notEqual(result.status, 0, "recover must abort when env is unreadable");
      assert.match(output, /DEPLOY CAN READ ENV = NO/);
      assert.match(output, /#353 PRODUCTION ACCEPTANCE = FAILED/);
      assert.equal(existsSyncSafe(fixture.startedMarker), false, "must not start when env unreadable");
    } finally {
      rmSync(unreadRoot, { recursive: true, force: true });
    }
  }
}

function extractRemoteDiskAuditScript(workflowText) {
  const start = workflowText.indexOf("<<'REMOTE_DISK_AUDIT'\n");
  const end = workflowText.indexOf("\n          REMOTE_DISK_AUDIT\n", start);
  assert.ok(start >= 0 && end > start, "audit job must contain a REMOTE_DISK_AUDIT heredoc");
  return workflowText
    .slice(start + "<<'REMOTE_DISK_AUDIT'\n".length, end)
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n");
}

function assertDiskStorageAudit(workflowText, docsText) {
  const required = [
    "OPS_DISK_STORAGE_AUDIT",
    "DISK BEFORE =",
    "LARGEST DIRECTORIES =",
    "TEST/ORPHAN FILES FOUND =",
    "OLD RELEASES FOUND =",
    "SAFE TO DELETE =",
    "ESTIMATED SPACE RECOVERY =",
    "CUTOVER = NO",
    "audiolad_deploy = NOT_INVOKED",
    "MODE = read_only_audit",
    "du -xh --max-depth=2",
    "6aa9fd82",
    "synth_3h",
    "synth_3h_le10800",
    "studio-draft-assets",
    "studio-renders",
    "loadEnvConfig(dir, false, silent, true)",
    "CUTOVER=NO",
    "audiolad_deploy=NOT_INVOKED",
  ];
  for (const needle of required) {
    assert.match(
      workflowText,
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `disk audit workflow must contain ${needle}`,
    );
  }

  const auditStart = workflowText.indexOf("name: Ops disk/Storage audit");
  const cleanupStart = workflowText.indexOf("name: Ops disk/Storage cleanup");
  const deployStart = workflowText.indexOf("name: Deploy to production");
  const recoverStart = workflowText.indexOf("name: Ops Studio worker recover");
  const dupDiagStart = workflowText.indexOf("name: Ops Studio duplicate asset diagnostic");
  assert.ok(auditStart >= 0 && deployStart > auditStart, "audit job must precede deploy job");
  assert.ok(cleanupStart > auditStart && deployStart > cleanupStart, "cleanup job must sit between audit and deploy");
  assert.ok(dupDiagStart > cleanupStart && deployStart > dupDiagStart, "dup-asset diag job must sit between cleanup and deploy");
  const auditJob = workflowText.slice(auditStart, cleanupStart);
  const recoverJob = workflowText.slice(recoverStart, auditStart);
  const diagnoseJob = workflowText.slice(
    workflowText.indexOf("name: Production read-only diagnostics"),
    recoverStart,
  );
  const deployJob = workflowText.slice(deployStart);
  assert.doesNotMatch(
    auditJob,
    /sudo -n \/usr\/local\/sbin\/audiolad-deploy/,
    "audit job must not invoke audiolad-deploy",
  );
  assert.doesNotMatch(auditJob, /pm2 delete/, "audit job must stay read-only");
  assert.doesNotMatch(auditJob, /pm2 start/, "audit job must not start PM2 apps");
  assert.doesNotMatch(auditJob, /pm2 (restart|flush|save)/, "audit job must not mutate PM2");
  const auditCode = auditJob
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(auditCode, /\bdeploy\.sh\b/, "audit job must not call deploy.sh");
  const remoteAudit = extractRemoteDiskAuditScript(workflowText);
  const remoteAuditCode = remoteAudit
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(remoteAuditCode, /\brm -rf\b/, "audit remote script must not rm -rf production paths");
  assert.doesNotMatch(remoteAuditCode, /\btruncate\b/, "audit job must not truncate");
  assert.doesNotMatch(remoteAuditCode, /DELETE FROM/i, "audit job must not DELETE SQL");
  assert.doesNotMatch(remoteAuditCode, /\.remove\(/, "audit job must not remove storage objects");
  assert.doesNotMatch(remoteAuditCode, /docker\s+(prune|rm|volume rm)/, "audit job must not prune docker");
  assert.doesNotMatch(
    auditCode,
    /\bsource\s+[^\n]*\.(env\.production|env\.local)/,
    "audit job must not source env files",
  );
  assert.doesNotMatch(
    auditJob,
    /cat\s+[^\n]*\.(env\.production|env\.local)/,
    "audit job must not cat env files",
  );
  assert.doesNotMatch(diagnoseJob, /OPS_DISK_STORAGE_AUDIT/);
  assert.doesNotMatch(recoverJob, /OPS_DISK_STORAGE_AUDIT/);
  assert.doesNotMatch(deployJob, /OPS_DISK_STORAGE_AUDIT/);
  assert.doesNotMatch(auditJob, /OPS_DISK_STORAGE_CLEANUP/);
  assert.doesNotMatch(auditJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(auditJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.match(docsText, /OPS_DISK_STORAGE_AUDIT/);
  assert.match(docsText, /audiolad-disk-storage-audit\.sh/);
}

function assertRemoteDiskAuditScriptSyntax(workflowText) {
  const remote = extractRemoteDiskAuditScript(workflowText);
  const scriptPath = join(tmpdir(), `audiolad-disk-audit-remote-${process.pid}.sh`);
  writeFileSync(scriptPath, remote);
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  rmSync(scriptPath, { force: true });
  assert.equal(syntax.status, 0, `remote disk audit bash -n failed: ${syntax.stderr}`);
}

function writeDiskAuditFixture(root, { secretUrl, secretKey }) {
  const releaseCurrent = "20260907-120000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const releasePrevious = "20260907-110000-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const releaseOld = "20260906-090000-cccccccccccccccccccccccccccccccccccccccc";
  const currentDir = join(root, "deploy", "releases", releaseCurrent);
  const previousDir = join(root, "deploy", "releases", releasePrevious);
  const oldDir = join(root, "deploy", "releases", releaseOld);
  const sharedDir = join(root, "deploy", "shared");
  const binDir = join(root, "bin");
  const tmpDir = join(root, "tmp");
  const logDir = join(root, "log");
  const nginxDir = join(root, "log", "nginx");
  const pm2Dir = join(root, "pm2-logs");
  mkdirSync(currentDir, { recursive: true });
  mkdirSync(previousDir, { recursive: true });
  mkdirSync(oldDir, { recursive: true });
  mkdirSync(join(currentDir, "node_modules", "@next", "env"), { recursive: true });
  mkdirSync(join(currentDir, "node_modules", "@supabase", "supabase-js"), { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(nginxDir, { recursive: true });
  mkdirSync(pm2Dir, { recursive: true });
  writeFileSync(join(currentDir, ".deploy-commit"), "a".repeat(40) + "\n");
  writeFileSync(join(previousDir, ".deploy-commit"), "b".repeat(40) + "\n");
  writeFileSync(join(oldDir, ".deploy-commit"), "c".repeat(40) + "\n");
  writeFileSync(join(oldDir, "old-payload.bin"), "x".repeat(4096));
  writeFileSync(
    join(sharedDir, ".env.production"),
    `NEXT_PUBLIC_SUPABASE_URL=${secretUrl}\nSUPABASE_SERVICE_ROLE_KEY=${secretKey}\n`,
  );
  symlinkSync(join(sharedDir, ".env.production"), join(currentDir, ".env.production"));
  symlinkSync(currentDir, join(root, "deploy", "current"));
  symlinkSync(previousDir, join(root, "deploy", "previous"));
  writeFileSync(join(tmpDir, "synth_3h_le10800.wav"), "fixture-wav");
  mkdirSync(join(tmpDir, "audiolad-studio-6aa9fd82-leftover"), { recursive: true });
  writeFileSync(join(tmpDir, "audiolad-studio-6aa9fd82-leftover", "work.wav"), "tmp-work");
  writeFileSync(join(tmpDir, "real-user-render-workspace.txt"), "do-not-mark-safe");
  writeFileSync(join(nginxDir, "access.log"), "ok\n");
  writeFileSync(join(pm2Dir, "audiolad-out.log"), "ok\n");
  writeFileSync(
    join(currentDir, "node_modules", "@next", "env", "package.json"),
    JSON.stringify({ name: "@next/env", main: "index.js" }),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@next", "env", "index.js"),
    [
      "const fs = require('fs');",
      "const path = require('path');",
      "function loadEnvConfig(dir) {",
      "  const file = path.join(dir, '.env.production');",
      "  const text = fs.readFileSync(file, 'utf8');",
      "  for (const line of text.split('\\n')) {",
      "    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);",
      "    if (m) process.env[m[1]] = m[2];",
      "  }",
      "}",
      "module.exports = { loadEnvConfig };",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@supabase", "supabase-js", "package.json"),
    JSON.stringify({ name: "@supabase/supabase-js", main: "index.js" }),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@supabase", "supabase-js", "index.js"),
    [
      "function rowsFor(table, filter) {",
      "  const col = filter && filter.col;",
      "  const pat = String((filter && filter.pat) || '').toLowerCase();",
      "  if (table === 'studio_projects') {",
      "    if (pat.includes('synth_3h') || pat.includes('6aa9fd82')) {",
      "      return [{ id: '6aa9fd82-1111-2222-3333-444444444444', status: 'deleted', deleted_at: '2026-09-01T00:00:00Z', author_id: 'author-test', name: 'synth_3h_le10800' }];",
      "    }",
      "    if (pat.includes('75-min')) {",
      "      return [];",
      "    }",
      "    return [];",
      "  }",
      "  if (table === 'studio_project_assets') {",
      "    if (pat.includes('6aa9fd82') || pat.includes('synth_3h') || col === 'size_bytes' || col === 'duration_seconds') {",
      "      return [{ id: 'asset-test', project_id: '6aa9fd82-1111-2222-3333-444444444444', storage_path: 'studio/author/6aa9fd82-1111-2222-3333-444444444444/asset-test/synth_3h.wav', original_name: 'synth_3h_le10800.wav', size_bytes: 359661568, duration_seconds: 10802, deleted_at: '2026-09-01T00:00:00Z' }];",
      "    }",
      "    return [];",
      "  }",
      "  if (table === 'studio_render_jobs') {",
      "    if (pat.includes('6aa9fd82') || pat.includes('synth_3h')) {",
      "      return [{ id: 'job-test', project_id: '6aa9fd82-1111-2222-3333-444444444444', status: 'failed', output_storage_path: 'studio/6aa9fd82-1111-2222-3333-444444444444/render.mp3' }];",
      "    }",
      "    return [];",
      "  }",
      "  return [];",
      "}",
      "function createClient() {",
      "  return {",
      "    from(table) {",
      "      const state = { table, col: '', pat: '', gteCol: '', lteCol: '' };",
      "      const api = {",
      "        select() { return api; },",
      "        ilike(col, pat) { state.col = col; state.pat = pat; return api; },",
      "        gte(col) { state.gteCol = col; return api; },",
      "        lte(col) { state.lteCol = col; return api; },",
      "        then(resolve) {",
      "          resolve({ data: rowsFor(state.table, { col: state.col || state.gteCol, pat: state.pat }), error: null });",
      "        },",
      "      };",
      "      return api;",
      "    },",
      "    storage: {",
      "      from(bucket) {",
      "        return {",
      "          list(_prefix, opts) {",
      "            const search = String((opts && opts.search) || '').toLowerCase();",
      "            if (!search.includes('6aa9fd82') && !search.includes('synth_3h')) {",
      "              return Promise.resolve({ data: [], error: null });",
      "            }",
      "            return Promise.resolve({",
      "              data: [{ name: 'studio/author/6aa9fd82-1111-2222-3333-444444444444/asset-test/synth_3h.wav', metadata: { size: 359661568 } }],",
      "              error: null,",
      "            });",
      "          },",
      "        };",
      "      },",
      "    },",
      "  };",
      "}",
      "module.exports = { createClient };",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(binDir, "docker"),
    [
      "#!/usr/bin/env bash",
      "echo 'permission denied' >&2",
      "exit 1",
      "",
    ].join("\n"),
  );
  chmodSync(join(binDir, "docker"), 0o755);
  return {
    binDir,
    deployRoot: join(root, "deploy"),
    tmpDir,
    logDir,
    nginxDir,
    pm2Dir,
    releaseOld,
    releaseCurrent,
    releasePrevious,
  };
}

function runDiskAuditHelper(root, fixture) {
  return spawnSync("bash", [diskAuditPath], {
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      DEPLOY_ROOT: fixture.deployRoot,
      AUDIT_TMP_DIR: fixture.tmpDir,
      AUDIT_LOG_DIR: fixture.logDir,
      AUDIT_NGINX_LOG_DIR: fixture.nginxDir,
      AUDIT_PM2_LOG_DIR: fixture.pm2Dir,
      PATH: `${fixture.binDir}:${process.env.PATH ?? ""}`,
      AUDIOLAD_DOCKER_BIN: join(fixture.binDir, "docker"),
    },
  });
}

function assertDiskAuditHelper() {
  const helperText = readFileSync(diskAuditPath, "utf8");
  const syntax = spawnSync("bash", ["-n", diskAuditPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `disk audit helper bash -n failed: ${syntax.stderr}`);
  assert.match(helperText, /OPS_DISK_STORAGE_AUDIT/);
  assert.match(helperText, /DISK BEFORE =/);
  assert.match(helperText, /SAFE TO DELETE =/);
  assert.match(helperText, /MODE = read_only_audit/);
  assert.match(helperText, /loadEnvConfig\(dir, false, silent, true\)/);
  assert.doesNotMatch(helperText, /\/usr\/local\/sbin\/audiolad-deploy/);
  assert.doesNotMatch(helperText, /pm2 delete/);
  assert.doesNotMatch(helperText, /DELETE FROM/i);
  const helperCode = helperText
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(helperCode, /\bsource\s+[^\n]*\.env\.production/);
  assert.doesNotMatch(helperText, /cat\s+[^\n]*\.(env\.production|env\.local)/);
  chmodSync(diskAuditPath, 0o755);

  const secretUrl = "https://env-bootstrap-test.example.invalid";
  const secretKey = "super-secret-service-role-key-do-not-log";
  const root = mkdtempSync(join(tmpdir(), "audiolad-disk-storage-audit-"));
  try {
    const fixture = writeDiskAuditFixture(root, { secretUrl, secretKey });
    const result = runDiskAuditHelper(root, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `disk audit helper failed: ${output}`);
    assert.match(output, /DISK BEFORE =/);
    assert.match(output, /LARGEST DIRECTORIES =/);
    assert.match(output, /TEST\/ORPHAN FILES FOUND =/);
    assert.match(output, /OLD RELEASES FOUND =/);
    assert.match(output, /SAFE TO DELETE =/);
    assert.match(output, /ESTIMATED SPACE RECOVERY =/);
    assert.match(output, /CUTOVER = NO/);
    assert.match(output, /audiolad_deploy = NOT_INVOKED/);
    assert.match(output, /MODE = read_only_audit/);
    assert.match(output, /CUTOVER=NO/);
    assert.match(output, /db_probe=docker_unavailable fallback=node/);
    assert.match(output, new RegExp(`mark=CURRENT`));
    assert.match(output, new RegExp(`mark=PREVIOUS`));
    assert.match(output, new RegExp(`release=${fixture.releaseOld} mark=CANDIDATE`));
    assert.match(output, new RegExp(`SAFE_TO_DELETE kind=release[\\s\\S]*${fixture.releaseOld}`));
    assert.match(output, /synth_3h_le10800/);
    assert.match(output, /6aa9fd82/);
    assert.match(output, /SAFE_TO_DELETE kind=disk_test_fixture/);
    assert.match(output, /SAFE_TO_DELETE kind=project|SAFE_TO_DELETE kind=asset|SAFE_TO_DELETE kind=storage/);
    assert.doesNotMatch(output, /real-user-render-workspace\.txt/);
    assert.doesNotMatch(output, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(existsSync(join(fixture.deployRoot, "releases", fixture.releaseOld)), "audit must not delete old release");
    assert.ok(existsSync(join(fixture.tmpDir, "synth_3h_le10800.wav")), "audit must not delete test fixture file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function extractRemoteDiskCleanupScript(workflowText) {
  const start = workflowText.indexOf("<<'REMOTE_DISK_CLEANUP'\n");
  const end = workflowText.indexOf("\n          REMOTE_DISK_CLEANUP\n", start);
  assert.ok(start >= 0 && end > start, "cleanup job must contain a REMOTE_DISK_CLEANUP heredoc");
  return workflowText
    .slice(start + "<<'REMOTE_DISK_CLEANUP'\n".length, end)
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n");
}

function assertDiskStorageCleanup(workflowText, docsText) {
  const required = [
    "OPS_DISK_STORAGE_CLEANUP",
    "DISK AFTER =",
    "SPACE FREED =",
    "CURRENT RELEASE INTACT =",
    "PREVIOUS RELEASE INTACT =",
    "REAL USER PROJECTS UNTOUCHED =",
    "TEST STORAGE OBJECTS REMOVED =",
    "TEST DB ROWS CLEANED =",
    "WORKER STATUS =",
    "PUBLIC HEALTH =",
    "RELEASES_CLEANUP =",
    "ASSETS_CLEANUP =",
    "CLEANUP =",
    "permission_denied_root_owned",
    "rm_denied_count=",
    "CUTOVER = NO",
    "MODE = allowlist_cleanup",
    "20260906-113101-2acc27e1",
    "20260907-064414-b85c870a",
    "6aa9fd82-7bb6-4df6-8761-6c2f8a1337b4",
    "4fc1d620-aaff-44fe-9893-8ca27e29",
    "800870b6-59cc-4f71-9df7-e30260723f83",
    "studio-draft-assets",
    "loadEnvConfig(dir, false, silent, true)",
    "CUTOVER=NO",
    "audiolad_deploy=NOT_INVOKED",
    "confirm=OPS_DISK_STORAGE_CLEANUP",
    "mktemp /tmp/audiolad-disk-cleanup-allowlist.XXXXXX.mjs",
    "temp_path_missing_mjs",
    "RELEASE_GATE=NO reason=allowlist_import_failed",
    "ASSET_CLEANUP_ERROR=",
    "note=allowlisted_releases_may_be_root_owned_and_need_root_rm",
    "note=asset_cleanup_continues_after_release_rm_failures",
  ];
  for (const needle of required) {
    assert.match(
      workflowText,
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `disk cleanup workflow must contain ${needle}`,
    );
  }

  const cleanupStart = workflowText.indexOf("name: Ops disk/Storage cleanup");
  const deployStart = workflowText.indexOf("name: Deploy to production");
  const auditStart = workflowText.indexOf("name: Ops disk/Storage audit");
  const recoverStart = workflowText.indexOf("name: Ops Studio worker recover");
  const dupDiagStart = workflowText.indexOf("name: Ops Studio duplicate asset diagnostic");
  assert.ok(cleanupStart >= 0 && deployStart > cleanupStart, "cleanup job must precede deploy job");
  assert.ok(dupDiagStart > cleanupStart && deployStart > dupDiagStart, "dup-asset diag job must sit between cleanup and deploy");
  const cleanupJob = workflowText.slice(cleanupStart, dupDiagStart);
  const auditJob = workflowText.slice(auditStart, cleanupStart);
  const recoverJob = workflowText.slice(recoverStart, auditStart);
  const diagnoseJob = workflowText.slice(
    workflowText.indexOf("name: Production read-only diagnostics"),
    recoverStart,
  );
  const deployJob = workflowText.slice(deployStart);
  assert.doesNotMatch(
    cleanupJob,
    /sudo -n \/usr\/local\/sbin\/audiolad-deploy/,
    "cleanup job must not invoke audiolad-deploy",
  );
  assert.doesNotMatch(cleanupJob, /pm2 delete/, "cleanup job must not restart PM2");
  assert.doesNotMatch(cleanupJob, /pm2 start/, "cleanup job must not start PM2 apps");
  assert.doesNotMatch(cleanupJob, /pm2 (restart|flush|save)/, "cleanup job must not mutate PM2");
  const cleanupCode = cleanupJob
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(cleanupCode, /\bdeploy\.sh\b/, "cleanup job must not call deploy.sh");
  assert.match(cleanupCode, /\brm -rf --/, "cleanup job must rm -rf only after allowlist gates");
  assert.doesNotMatch(cleanupJob, /docker\s+(prune|rm|volume rm)/, "cleanup must not prune docker");
  assert.doesNotMatch(cleanupJob, /\bnginx\s+-s\b/, "cleanup must not signal nginx");
  assert.doesNotMatch(
    cleanupCode,
    /\bsource\s+[^\n]*\.(env\.production|env\.local)/,
    "cleanup job must not source env files",
  );
  assert.doesNotMatch(
    cleanupJob,
    /cat\s+[^\n]*\.(env\.production|env\.local)/,
    "cleanup job must not cat env files",
  );
  assert.doesNotMatch(diagnoseJob, /OPS_DISK_STORAGE_CLEANUP/);
  assert.doesNotMatch(recoverJob, /OPS_DISK_STORAGE_CLEANUP/);
  assert.doesNotMatch(auditJob, /OPS_DISK_STORAGE_CLEANUP/);
  assert.doesNotMatch(deployJob, /OPS_DISK_STORAGE_CLEANUP/);
  assert.doesNotMatch(diagnoseJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(recoverJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(auditJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(cleanupJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(deployJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(diagnoseJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(recoverJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(auditJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(cleanupJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(deployJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.match(docsText, /OPS_DISK_STORAGE_CLEANUP/);
  assert.match(docsText, /audiolad-disk-storage-cleanup\.sh/);
  assert.match(docsText, /34113627251/);
  assert.match(
    cleanupJob,
    /mktemp \/tmp\/audiolad-disk-cleanup-allowlist\.XXXXXX\.mjs/,
    "workflow embedded allowlist temp must end with .mjs",
  );
  assert.match(
    cleanupJob,
    /gate_release "\$\{name\}" "\$\{current\}" "\$\{previous\}" "\$\{path\}" 2>&1/,
    "workflow must keep gate_release stderr visible",
  );
  assert.match(
    cleanupJob,
    /node "\$\{probe\}" "\$\{dir\}" "\$\{ALLOWLIST_MODULE\}" 2>&1/,
    "workflow must keep asset probe stderr visible",
  );
  assert.doesNotMatch(
    cleanupJob,
    /gate_release[^\n]*2>\/dev\/null/,
    "workflow must not swallow gate_release stderr",
  );
  assert.doesNotMatch(
    cleanupJob,
    /node "\$\{probe\}" "\$\{dir\}" "\$\{ALLOWLIST_MODULE\}" 2>\/dev\/null/,
    "workflow must not swallow asset probe stderr",
  );
  const resolveStart = cleanupJob.indexOf("resolve_allowlist_module() {");
  const resolveEnd = cleanupJob.indexOf("df_root_avail_kb()", resolveStart);
  assert.ok(resolveStart >= 0 && resolveEnd > resolveStart, "workflow must define resolve_allowlist_module");
  const resolveFn = cleanupJob.slice(resolveStart, resolveEnd);
  assert.doesNotMatch(
    resolveFn,
    /tmp="\$\(mktemp\)"/,
    "workflow resolve_allowlist_module must not use suffix-less mktemp",
  );
}

function assertRemoteDiskCleanupScriptSyntax(workflowText) {
  const remote = extractRemoteDiskCleanupScript(workflowText);
  const scriptPath = join(tmpdir(), `audiolad-disk-cleanup-remote-${process.pid}.sh`);
  writeFileSync(scriptPath, remote);
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  rmSync(scriptPath, { force: true });
  assert.equal(syntax.status, 0, `remote disk cleanup bash -n failed: ${syntax.stderr}`);
}

function writeCleanupMockModules(currentDir, { secretUrl, secretKey, assets, project, jobs }) {
  mkdirSync(join(currentDir, "node_modules", "@next", "env"), { recursive: true });
  mkdirSync(join(currentDir, "node_modules", "@supabase", "supabase-js"), { recursive: true });
  writeFileSync(
    join(currentDir, "node_modules", "@next", "env", "package.json"),
    JSON.stringify({ name: "@next/env", main: "index.js" }),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@next", "env", "index.js"),
    [
      "const fs = require('fs');",
      "const path = require('path');",
      "function loadEnvConfig(dir) {",
      "  const file = path.join(dir, '.env.production');",
      "  const text = fs.readFileSync(file, 'utf8');",
      "  for (const line of text.split('\\n')) {",
      "    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);",
      "    if (m) process.env[m[1]] = m[2];",
      "  }",
      "}",
      "module.exports = { loadEnvConfig };",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@supabase", "supabase-js", "package.json"),
    JSON.stringify({ name: "@supabase/supabase-js", main: "index.js" }),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@supabase", "supabase-js", "index.js"),
    [
      "const fs = require('fs');",
      "const path = require('path');",
      `const secretUrl = ${JSON.stringify(secretUrl)};`,
      `const secretKey = ${JSON.stringify(secretKey)};`,
      "const statePath = process.env.AUDIOLAD_CLEANUP_MOCK_STATE;",
      "function loadState() {",
      "  return JSON.parse(fs.readFileSync(statePath, 'utf8'));",
      "}",
      "function saveState(state) {",
      "  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));",
      "}",
      "function matches(row, filters) {",
      "  return filters.every((f) => {",
      "    if (f.op === 'eq') return String(row[f.col] ?? '') === String(f.val);",
      "    return true;",
      "  });",
      "}",
      "function createClient() {",
      "  return {",
      "    from(table) {",
      "      const ctx = { table, filters: [], head: false, countExact: false };",
      "      const api = {",
      "        select(_cols, opts) {",
      "          if (opts && opts.head) ctx.head = true;",
      "          if (opts && opts.count === 'exact') ctx.countExact = true;",
      "          return api;",
      "        },",
        "        eq(col, val) { ctx.filters.push({ op: 'eq', col, val }); return api; },",
      "        maybeSingle() {",
      "          const state = loadState();",
      "          const rows = (state[ctx.table] || []).filter((row) => matches(row, ctx.filters));",
      "          return Promise.resolve({ data: rows[0] || null, error: null, count: rows.length });",
      "        },",
      "        delete() { ctx.deleting = true; return api; },",
      "        then(resolve, reject) {",
      "          try {",
      "            const state = loadState();",
      "            const rows = (state[ctx.table] || []).filter((row) => matches(row, ctx.filters));",
      "            if (ctx.deleting) {",
      "              const keep = (state[ctx.table] || []).filter((row) => !matches(row, ctx.filters));",
      "              const removed = (state[ctx.table] || []).length - keep.length;",
      "              state[ctx.table] = keep;",
      "              state.deleted = (state.deleted || 0) + removed;",
      "              saveState(state);",
      "              resolve({ data: [], error: null, count: removed });",
      "              return;",
      "            }",
      "            resolve({ data: ctx.head ? [] : rows, error: null, count: rows.length });",
      "          } catch (err) {",
      "            if (typeof reject === 'function') reject(err);",
      "            else throw err;",
      "          }",
      "        },",
      "      };",
      "      return api;",
      "    },",
      "    storage: {",
      "      from(bucket) {",
      "        return {",
      "          remove(paths) {",
      "            const state = loadState();",
      "            state.removedStorage = (state.removedStorage || []).concat(",
      "              (paths || []).map((p) => ({ bucket, path: p })),",
      "            );",
      "            saveState(state);",
      "            return Promise.resolve({ data: paths, error: null });",
      "          },",
      "        };",
      "      },",
      "    },",
      "  };",
      "}",
      "module.exports = { createClient };",
      "",
    ].join("\n"),
  );
  const statePath = join(currentDir, "cleanup-mock-state.json");
  writeFileSync(
    statePath,
    JSON.stringify(
      {
        studio_projects: project ? [project] : [],
        studio_project_assets: assets,
        studio_render_jobs: jobs,
        studio_asset_sources: assets.map((asset) => ({
          id: asset.source_id || asset.id,
          storage_path: asset.storage_path,
        })),
        removedStorage: [],
        deleted: 0,
      },
      null,
      2,
    ),
  );
  return statePath;
}

function writeDiskCleanupFixture(
  root,
  {
    secretUrl,
    secretKey,
    currentIsAllowlisted = false,
    extraAssets = [],
    denyReleaseRm = false,
    projectAuthorId = null,
  },
) {
  const releaseCurrent = currentIsAllowlisted
    ? "20260906-113101-2acc27e1"
    : "20260907-120000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const releasePrevious = "20260907-110000-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const releaseAllowB = "20260907-064414-b85c870a";
  const releaseOther = "20260907-100034-fbda1c14";
  const currentDir = join(root, "deploy", "releases", releaseCurrent);
  const previousDir = join(root, "deploy", "releases", releasePrevious);
  const allowADir = join(root, "deploy", "releases", "20260906-113101-2acc27e1");
  const allowBDir = join(root, "deploy", "releases", releaseAllowB);
  const otherDir = join(root, "deploy", "releases", releaseOther);
  const sharedDir = join(root, "deploy", "shared");
  const binDir = join(root, "bin");
  const tmpDir = join(root, "tmp");
  mkdirSync(currentDir, { recursive: true });
  mkdirSync(previousDir, { recursive: true });
  mkdirSync(allowBDir, { recursive: true });
  mkdirSync(otherDir, { recursive: true });
  mkdirSync(allowADir, { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(join(currentDir, ".deploy-commit"), "a".repeat(40) + "\n");
  writeFileSync(join(previousDir, ".deploy-commit"), "b".repeat(40) + "\n");
  writeFileSync(join(allowADir, "old-payload.bin"), "x".repeat(4096));
  writeFileSync(join(allowBDir, "old-payload.bin"), "y".repeat(4096));
  writeFileSync(join(otherDir, "keep.bin"), "keep-me");
  writeFileSync(
    join(sharedDir, ".env.production"),
    `NEXT_PUBLIC_SUPABASE_URL=${secretUrl}\nSUPABASE_SERVICE_ROLE_KEY=${secretKey}\n`,
  );
  symlinkSync(join(sharedDir, ".env.production"), join(currentDir, ".env.production"));
  symlinkSync(currentDir, join(root, "deploy", "current"));
  symlinkSync(previousDir, join(root, "deploy", "previous"));
  mkdirSync(join(tmpDir, "audiolad-studio-gain-1-hwE7Nx"), { recursive: true });
  writeFileSync(join(tmpDir, "audiolad-studio-meditation.html"), "leave");
  const projectId = "6aa9fd82-7bb6-4df6-8761-6c2f8a1337b4";
  const assets = [
    {
      id: "800870b6-59cc-4f71-9df7-e30260723f83",
      project_id: projectId,
      original_name: "real_75min.mp3",
      storage_path: `studio/guest/${projectId}/800870b6-59cc-4f71-9df7-e30260723f83/real_75min.mp3`,
      source_id: "800870b6-59cc-4f71-9df7-e30260723f83",
      deleted_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "4fc1d620-aaff-44fe-9893-8ca27e29aa33",
      project_id: projectId,
      original_name: "synth_over3h.mp3",
      storage_path: `studio/guest/${projectId}/4fc1d620-aaff-44fe-9893-8ca27e29aa33/synth_over3h.mp3`,
      source_id: "4fc1d620-aaff-44fe-9893-8ca27e29aa33",
      deleted_at: "2026-09-01T00:00:00Z",
    },
    ...extraAssets,
  ];
  const statePath = writeCleanupMockModules(currentDir, {
    secretUrl,
    secretKey,
    assets,
    project: {
      id: projectId,
      author_id: projectAuthorId,
      name: "",
      status: "active",
      deleted_at: null,
      guest_session_id: "59c7e5b8-eae4-4394-82fb-b815a10be6c2",
      project_data: {},
    },
    jobs: [
      {
        id: "job-test",
        project_id: projectId,
        status: "failed",
        output_storage_path: "",
      },
    ],
  });
  writeFileSync(
    join(binDir, "pm2"),
    [
      "#!/usr/bin/env bash",
      'if [[ "${1:-}" == "status" ]]; then',
      "  echo '| audiolad-studio-render-worker | online |'",
      "  exit 0",
      "fi",
      'if [[ "${1:-}" == "jlist" ]]; then',
      "  echo '[{\"name\":\"audiolad-studio-render-worker\",\"pm2_env\":{\"status\":\"online\"}}]'",
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(binDir, "curl"),
    [
      "#!/usr/bin/env bash",
      'if [[ "$*" == *health/build* ]]; then',
      "  echo '{\"status\":\"ok\"}'",
      "  exit 0",
      "fi",
      "exit 1",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(binDir, "docker"),
    ["#!/usr/bin/env bash", "echo 'permission denied' >&2", "exit 1", ""].join("\n"),
  );
  if (denyReleaseRm) {
    writeFileSync(
      join(binDir, "rm"),
      [
        "#!/usr/bin/env bash",
        "for arg in \"$@\"; do",
        "  case \"${arg}\" in",
        "    *releases/20260906-113101-2acc27e1*|*releases/20260907-064414-b85c870a*)",
        "      i=0",
        "      while [[ \"${i}\" -lt 80 ]]; do",
        "        echo \"rm: cannot remove '${arg}/nested-${i}': Permission denied\" >&2",
        "        i=$((i + 1))",
        "      done",
        "      exit 1",
        "      ;;",
        "  esac",
        "done",
        'exec /bin/rm "$@"',
        "",
      ].join("\n"),
    );
    chmodSync(join(binDir, "rm"), 0o755);
  }
  chmodSync(join(binDir, "pm2"), 0o755);
  chmodSync(join(binDir, "curl"), 0o755);
  chmodSync(join(binDir, "docker"), 0o755);
  return {
    binDir,
    deployRoot: join(root, "deploy"),
    tmpDir,
    statePath,
    releaseCurrent,
    releasePrevious,
    releaseAllowB,
    releaseOther,
    currentIsAllowlisted,
  };
}

function runDiskCleanupHelper(root, fixture) {
  return spawnSync("bash", [diskCleanupPath], {
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      DEPLOY_ROOT: fixture.deployRoot,
      PATH: `${fixture.binDir}:${process.env.PATH ?? ""}`,
      AUDIOLAD_CLEANUP_MOCK_STATE: fixture.statePath,
      AUDIOLAD_DOCKER_BIN: join(fixture.binDir, "docker"),
    },
  });
}

function runDiskCleanupViaStdin(scriptText, fixture) {
  return spawnSync("bash", ["-s"], {
    encoding: "utf8",
    timeout: 20000,
    input: scriptText,
    env: {
      ...process.env,
      DEPLOY_ROOT: fixture.deployRoot,
      PATH: `${fixture.binDir}:${process.env.PATH ?? ""}`,
      AUDIOLAD_CLEANUP_MOCK_STATE: fixture.statePath,
      AUDIOLAD_DOCKER_BIN: join(fixture.binDir, "docker"),
    },
  });
}

function assertDiskCleanupHelper(workflowText) {
  const helperText = readFileSync(diskCleanupPath, "utf8");
  const syntax = spawnSync("bash", ["-n", diskCleanupPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `disk cleanup helper bash -n failed: ${syntax.stderr}`);
  assert.match(helperText, /OPS_DISK_STORAGE_CLEANUP/);
  assert.match(helperText, /MODE = allowlist_cleanup/);
  assert.match(helperText, /loadEnvConfig\(dir, false, silent, true\)/);
  assert.match(helperText, /20260906-113101-2acc27e1/);
  assert.match(helperText, /4fc1d620-aaff-44fe-9893-8ca27e29/);
  assert.match(helperText, /mktemp \/tmp\/audiolad-disk-cleanup-allowlist\.XXXXXX\.mjs/);
  assert.match(helperText, /temp_path_missing_mjs/);
  assert.doesNotMatch(helperText, /\/usr\/local\/sbin\/audiolad-deploy/);
  assert.doesNotMatch(helperText, /pm2 delete/);
  const helperCode = helperText
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(helperCode, /\bsource\s+[^\n]*\.env\.production/);
  chmodSync(diskCleanupPath, 0o755);

  const secretUrl = "https://cleanup-allowlist-test.example.invalid";
  const secretKey = "super-secret-service-role-key-do-not-log";
  const root = mkdtempSync(join(tmpdir(), "audiolad-disk-storage-cleanup-"));
  try {
    const fixture = writeDiskCleanupFixture(root, { secretUrl, secretKey });
    const result = runDiskCleanupHelper(root, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `disk cleanup helper failed: ${output}`);
    assert.match(output, /allowlist_module=.*\.mjs/);
    assert.match(output, /RELEASE_GATE=YES reason=allowlisted_release/);
    assert.match(output, /MODE = allowlist_cleanup/);
    assert.match(output, /CUTOVER = NO/);
    assert.match(output, /CLEANUP = SUCCESS/);
    assert.match(output, /RELEASES_CLEANUP = OK/);
    assert.match(output, /ASSETS_CLEANUP = OK/);
    assert.match(output, /CURRENT RELEASE INTACT = YES/);
    assert.match(output, /PREVIOUS RELEASE INTACT = YES/);
    assert.match(output, /REAL USER PROJECTS UNTOUCHED = YES/);
    assert.match(output, /release_deleted name=20260907-064414-b85c870a/);
    assert.match(output, /storage_removed/);
    assert.match(output, /redacted_resolved id=4fc1d620-aaff-44fe-9893-8ca27e29aa33/);
    assert.doesNotMatch(output, /pm2 delete/);
    assert.doesNotMatch(output, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releaseCurrent)), true);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releasePrevious)), true);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releaseOther)), true);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", "20260906-113101-2acc27e1")), false);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releaseAllowB)), false);
    assert.equal(existsSync(join(fixture.deployRoot, "shared", ".env.production")), true);
    assert.equal(existsSync(join(fixture.tmpDir, "audiolad-studio-gain-1-hwE7Nx")), true);
    assert.equal(existsSync(join(fixture.tmpDir, "audiolad-studio-meditation.html")), true);
    const state = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    assert.ok(state.removedStorage.length >= 1, "must remove allowlisted storage objects");
    assert.equal(
      (state.studio_project_assets || []).some((row) => row.id === "800870b6-59cc-4f71-9df7-e30260723f83"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const blockedRoot = mkdtempSync(join(tmpdir(), "audiolad-disk-storage-cleanup-blocked-"));
  try {
    const fixture = writeDiskCleanupFixture(blockedRoot, { secretUrl, secretKey, currentIsAllowlisted: true });
    const result = runDiskCleanupHelper(blockedRoot, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.notEqual(result.status, 0, "cleanup must fail when CURRENT is allowlisted");
    assert.match(output, /RELEASE_GATE=NO reason=current_is_allowlisted/);
    assert.match(output, /NEEDS_REVIEW kind=release reason=gate_failed/);
    assert.match(output, /RELEASES_CLEANUP = FAILED/);
    assert.match(output, /ASSETS_CLEANUP = OK/);
    assert.match(output, /CLEANUP = FAILED/);
    assert.match(output, /storage_removed/);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", "20260906-113101-2acc27e1")), true);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releaseCurrent)), true);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releasePrevious)), true);
  } finally {
    rmSync(blockedRoot, { recursive: true, force: true });
  }

  const foreignRoot = mkdtempSync(join(tmpdir(), "audiolad-disk-storage-cleanup-foreign-"));
  try {
    const fixture = writeDiskCleanupFixture(foreignRoot, {
      secretUrl,
      secretKey,
      extraAssets: [
        {
          id: "real-user-asset",
          project_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          original_name: "client.mp3",
          storage_path: "studio/author/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/real-user-asset/client.mp3",
          source_id: "800870b6-59cc-4f71-9df7-e30260723f83",
        },
      ],
    });
    const result = runDiskCleanupHelper(foreignRoot, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.notEqual(result.status, 0, "cleanup must fail when storage is shared with another project");
    assert.match(output, /NEEDS_REVIEW kind=asset reason=shared_with_other_project/);
    assert.match(output, /RELEASES_CLEANUP = OK/);
    assert.match(output, /ASSETS_CLEANUP = FAILED/);
    assert.match(output, /CLEANUP = FAILED/);
    const state = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    assert.equal(
      (state.studio_project_assets || []).some((row) => row.id === "real-user-asset"),
      true,
      "real user asset row must remain",
    );
  } finally {
    rmSync(foreignRoot, { recursive: true, force: true });
  }

  const stdinRoot = mkdtempSync(join(tmpdir(), "audiolad-disk-storage-cleanup-stdin-"));
  try {
    const fixture = writeDiskCleanupFixture(stdinRoot, { secretUrl, secretKey });
    const helperResult = runDiskCleanupViaStdin(helperText, fixture);
    const helperOutput = `${helperResult.stdout ?? ""}${helperResult.stderr ?? ""}`;
    assert.equal(helperResult.status, 0, `disk cleanup helper via bash -s failed: ${helperOutput}`);
    assert.match(
      helperOutput,
      /allowlist_module=\/tmp\/audiolad-disk-cleanup-allowlist\.[A-Za-z0-9]+\.mjs/,
      "helper bash -s must write an .mjs allowlist temp",
    );
    assert.match(helperOutput, /CLEANUP = SUCCESS/);
    assert.match(helperOutput, /RELEASE_GATE=YES reason=allowlisted_release/);
  } finally {
    rmSync(stdinRoot, { recursive: true, force: true });
  }

  const remoteRoot = mkdtempSync(join(tmpdir(), "audiolad-disk-storage-cleanup-remote-stdin-"));
  try {
    const fixture = writeDiskCleanupFixture(remoteRoot, { secretUrl, secretKey });
    const remote = extractRemoteDiskCleanupScript(workflowText);
    const remoteResult = runDiskCleanupViaStdin(remote, fixture);
    const remoteOutput = `${remoteResult.stdout ?? ""}${remoteResult.stderr ?? ""}`;
    assert.equal(remoteResult.status, 0, `workflow bash -s cleanup failed: ${remoteOutput}`);
    assert.match(
      remoteOutput,
      /allowlist_module=\/tmp\/audiolad-disk-cleanup-allowlist\.[A-Za-z0-9]+\.mjs/,
      "workflow bash -s must write an .mjs allowlist temp",
    );
    assert.match(remoteOutput, /CLEANUP = SUCCESS/);
    assert.match(remoteOutput, /confirm=OPS_DISK_STORAGE_CLEANUP/);
    assert.doesNotMatch(remoteOutput, /ASSET_CLEANUP=UNAVAILABLE reason=error/);
  } finally {
    rmSync(remoteRoot, { recursive: true, force: true });
  }

  const authoredRoot = mkdtempSync(join(tmpdir(), "audiolad-disk-storage-cleanup-authored-"));
  try {
    const fixture = writeDiskCleanupFixture(authoredRoot, {
      secretUrl,
      secretKey,
      projectAuthorId: "6aa9-real-acceptance-author",
    });
    const result = runDiskCleanupHelper(authoredRoot, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(
      result.status,
      0,
      `acceptance project author_id must not fail asset cleanup: ${output}`,
    );
    assert.match(output, /ASSETS_CLEANUP = OK/);
    assert.match(output, /CLEANUP = SUCCESS/);
    assert.match(output, /storage_removed/);
    assert.match(output, /note=project_left id=6aa9fd82-7bb6-4df6-8761-6c2f8a1337b4 reason=has_author/);
    assert.doesNotMatch(output, /has_real_user_author/);
    assert.doesNotMatch(output, /NEEDS_REVIEW kind=project/);
    const state = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    assert.ok(state.removedStorage.length >= 1, "allowlisted storage must still be deleted");
    assert.equal(
      (state.studio_project_assets || []).some((row) => row.id === "800870b6-59cc-4f71-9df7-e30260723f83"),
      false,
      "allowlisted asset row must be deleted even when project.author_id is set",
    );
    assert.equal(
      (state.studio_projects || []).some((row) => row.id === "6aa9fd82-7bb6-4df6-8761-6c2f8a1337b4"),
      true,
      "authored acceptance project row must remain",
    );
  } finally {
    rmSync(authoredRoot, { recursive: true, force: true });
  }

  const deniedRoot = mkdtempSync(join(tmpdir(), "audiolad-disk-storage-cleanup-denied-"));
  try {
    const fixture = writeDiskCleanupFixture(deniedRoot, {
      secretUrl,
      secretKey,
      denyReleaseRm: true,
    });
    const result = runDiskCleanupHelper(deniedRoot, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `root-owned release deferral should not abort: ${output}`);
    assert.match(output, /NEEDS_REVIEW kind=release reason=permission_denied_root_owned/);
    assert.match(output, /rm_denied_count=/);
    assert.match(output, /RELEASES_CLEANUP = DEFERRED/);
    assert.match(output, /ASSETS_CLEANUP = OK/);
    assert.match(output, /CLEANUP = PARTIAL/);
    assert.match(output, /storage_removed/);
    assert.match(output, /note=allowlisted_releases_need_root_rm/);
    assert.doesNotMatch(output, /rm: cannot remove/);
    const cannotRemoveCount = (output.match(/cannot remove/g) || []).length;
    assert.equal(cannotRemoveCount, 0, "must summarize rm permission errors instead of flooding");
    assert.equal(existsSync(join(fixture.deployRoot, "releases", "20260906-113101-2acc27e1")), true);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releaseAllowB)), true);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releaseCurrent)), true);
    assert.equal(existsSync(join(fixture.deployRoot, "releases", fixture.releasePrevious)), true);
    const state = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    assert.ok(state.removedStorage.length >= 1, "assets must still be deleted when release rm is denied");
  } finally {
    rmSync(deniedRoot, { recursive: true, force: true });
  }
}

function extractRemoteStudioDupAssetDiagScript(workflowText) {
  const start = workflowText.indexOf("<<'REMOTE_STUDIO_DUP_ASSET_DIAG'\n");
  const end = workflowText.indexOf("\n          REMOTE_STUDIO_DUP_ASSET_DIAG\n", start);
  assert.ok(start >= 0 && end > start, "dup-asset diag job must contain a REMOTE_STUDIO_DUP_ASSET_DIAG heredoc");
  return workflowText
    .slice(start + "<<'REMOTE_STUDIO_DUP_ASSET_DIAG'\n".length, end)
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n");
}

function assertStudioDuplicateAssetDiag(workflowText, docsText) {
  const required = [
    "OPS_STUDIO_DUPLICATE_ASSET_DIAG",
    "STUDIO_DUPLICATE_ASSET_DIAG",
    "3832ded1-4100-4478-a8d4-7fc6a635f72e",
    "d8b6ad31-d5e1-4c0f-9f3c-ccd7067cf120",
    "6780c421-4411-4114-9c27-5f433dca1c2a",
    "AUDIOLAD_DUP_ASSET_PROJECT_ID",
    "AUDIOLAD_DUP_VERIFY_PROJECT_ID",
    "AUDIOLAD_DUP_VERIFY_SOURCE_PROJECT_ID",
    "BROKEN_PROJECT_ID=",
    "ASSET_ROW_COUNT=",
    "UPLOAD_STATE_COUNTS=",
    "SOURCE_ID_NE_ID_COUNT=",
    "ALL_RESERVED=",
    "SOURCE_OBJECTS_INTACT=",
    "ORIGINAL_PROJECT_ID=",
    "ORIGINAL_REFS_READY=",
    "VERIFY_PROJECT_ID=",
    "VERIFY_ASSET_COUNT=",
    "VERIFY_ALL_READY=",
    "VERIFY_SHARED_REF_COUNT=",
    "VERIFY_OWN_UPLOAD_COUNT=",
    "VERIFY_SOURCE_PROJECT_ID=",
    "VERIFY_SOURCE_ID_REUSE=",
    "BROKEN_SHARED_REFS_COUNT=",
    "BROKEN_PROJECT_IDS=",
    "3832DED1_FOUND=",
    "DUPLICATION_AUDIT_PROJECT_ID=",
    "DUPLICATION_AUDIT_SOURCE_PROJECT_ID=",
    "author_support_audit_events",
    "studio_project_duplicated",
    "loadEnvConfig(dir, false, silent, true)",
    "CUTOVER=NO",
    "audiolad_deploy=NOT_INVOKED",
    "MODE = read_only_duplicate_asset_diag",
    "studio-draft-assets",
    "studio_asset_sources",
    "confirm=OPS_STUDIO_DUPLICATE_ASSET_DIAG",
    "no_signed_urls_no_keys_no_storage_urls",
    "supabase_url_host=",
    "project_query_error=",
    "PROJECT_ID_PREFIX_CANDIDATES=",
    ".ilike(",
  ];
  for (const needle of required) {
    assert.match(
      workflowText,
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `dup-asset diag workflow must contain ${needle}`,
    );
  }

  const dupStart = workflowText.indexOf("name: Ops Studio duplicate asset diagnostic");
  const courseUpgradeStart = workflowText.indexOf("name: Ops course upgrade diagnostic");
  const deployStart = workflowText.indexOf("name: Deploy to production");
  const cleanupStart = workflowText.indexOf("name: Ops disk/Storage cleanup");
  const auditStart = workflowText.indexOf("name: Ops disk/Storage audit");
  const recoverStart = workflowText.indexOf("name: Ops Studio worker recover");
  assert.ok(dupStart >= 0 && deployStart > dupStart, "dup-asset diag job must precede deploy job");
  assert.ok(
    courseUpgradeStart > dupStart && deployStart > courseUpgradeStart,
    "course-upgrade diag job must sit between dup-asset diag and deploy",
  );
  const dupJob = workflowText.slice(dupStart, courseUpgradeStart);
  const cleanupJob = workflowText.slice(cleanupStart, dupStart);
  const auditJob = workflowText.slice(auditStart, cleanupStart);
  const recoverJob = workflowText.slice(recoverStart, auditStart);
  const diagnoseJob = workflowText.slice(
    workflowText.indexOf("name: Production read-only diagnostics"),
    recoverStart,
  );
  const deployJob = workflowText.slice(deployStart);
  assert.doesNotMatch(
    dupJob,
    /sudo -n \/usr\/local\/sbin\/audiolad-deploy/,
    "dup-asset diag job must not invoke audiolad-deploy",
  );
  assert.doesNotMatch(dupJob, /pm2 delete/, "dup-asset diag job must stay read-only");
  assert.doesNotMatch(dupJob, /pm2 start/, "dup-asset diag job must not start PM2 apps");
  assert.doesNotMatch(dupJob, /pm2 (restart|flush|save)/, "dup-asset diag job must not mutate PM2");
  assert.doesNotMatch(dupJob, /\bnginx\s+-s\b/, "dup-asset diag must not signal nginx");
  const dupCode = dupJob
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(dupCode, /\bdeploy\.sh\b/, "dup-asset diag job must not call deploy.sh");
  const remote = extractRemoteStudioDupAssetDiagScript(workflowText);
  const remoteCode = remote
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(remoteCode, /\brm -rf\b/, "dup-asset diag remote must not rm -rf production paths");
  assert.doesNotMatch(remoteCode, /DELETE FROM/i, "dup-asset diag must not DELETE SQL");
  assert.doesNotMatch(remoteCode, /UPDATE /i, "dup-asset diag must not UPDATE SQL");
  assert.doesNotMatch(remoteCode, /INSERT INTO/i, "dup-asset diag must not INSERT SQL");
  assert.doesNotMatch(remoteCode, /\.remove\(/, "dup-asset diag must not remove storage objects");
  assert.doesNotMatch(remoteCode, /\.update\(/, "dup-asset diag must not update rows");
  assert.doesNotMatch(remoteCode, /\.insert\(/, "dup-asset diag must not insert rows");
  assert.doesNotMatch(remoteCode, /\.delete\(/, "dup-asset diag must not delete rows");
  assert.doesNotMatch(remote, /createSignedUrl/, "dup-asset diag must not create signed URLs");
  assert.doesNotMatch(remote, /createSignedUploadUrl/, "dup-asset diag must not create signed upload URLs");
  assert.doesNotMatch(
    dupCode,
    /\bsource\s+[^\n]*\.(env\.production|env\.local)/,
    "dup-asset diag job must not source env files",
  );
  assert.doesNotMatch(
    dupJob,
    /cat\s+[^\n]*\.(env\.production|env\.local)/,
    "dup-asset diag job must not cat env files",
  );
  assert.doesNotMatch(diagnoseJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(recoverJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(auditJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(cleanupJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(deployJob, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.doesNotMatch(diagnoseJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(recoverJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(auditJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(cleanupJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(dupJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(deployJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.match(docsText, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.match(docsText, /audiolad-studio-duplicate-asset-diag\.sh/);
}

function assertRemoteStudioDupAssetDiagScriptSyntax(workflowText) {
  const remote = extractRemoteStudioDupAssetDiagScript(workflowText);
  const scriptPath = join(tmpdir(), `audiolad-studio-dup-asset-diag-remote-${process.pid}.sh`);
  writeFileSync(scriptPath, remote);
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  rmSync(scriptPath, { force: true });
  assert.equal(syntax.status, 0, `remote studio dup-asset diag bash -n failed: ${syntax.stderr}`);
}

function writeStudioDupAssetDiagFixture(root, { secretUrl, secretKey, scenario = "copy_reserved" }) {
  const releaseCurrent = "20260908-120000-dddddddddddddddddddddddddddddddddddddddd";
  const currentDir = join(root, "deploy", "releases", releaseCurrent);
  const sharedDir = join(root, "deploy", "shared");
  mkdirSync(join(currentDir, "node_modules", "@next", "env"), { recursive: true });
  mkdirSync(join(currentDir, "node_modules", "@supabase", "supabase-js"), { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(join(currentDir, ".deploy-commit"), "d".repeat(40) + "\n");
  writeFileSync(
    join(sharedDir, ".env.production"),
    `NEXT_PUBLIC_SUPABASE_URL=${secretUrl}\nSUPABASE_SERVICE_ROLE_KEY=${secretKey}\n`,
  );
  symlinkSync(join(sharedDir, ".env.production"), join(currentDir, ".env.production"));
  symlinkSync(currentDir, join(root, "deploy", "current"));
  writeFileSync(
    join(currentDir, "node_modules", "@next", "env", "package.json"),
    JSON.stringify({ name: "@next/env", main: "index.js" }),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@next", "env", "index.js"),
    [
      "const fs = require('fs');",
      "const path = require('path');",
      "function loadEnvConfig(dir) {",
      "  const file = path.join(dir, '.env.production');",
      "  const text = fs.readFileSync(file, 'utf8');",
      "  for (const line of text.split('\\n')) {",
      "    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);",
      "    if (m) process.env[m[1]] = m[2];",
      "  }",
      "}",
      "module.exports = { loadEnvConfig };",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@supabase", "supabase-js", "package.json"),
    JSON.stringify({ name: "@supabase/supabase-js", main: "index.js" }),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@supabase", "supabase-js", "index.js"),
    [
      "const BROKEN = '3832ded1-4100-4478-a8d4-7fc6a635f72e';",
      "const ORIGINAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';",
      "const SOURCE_A = '11111111-1111-4111-8111-111111111111';",
      "const SOURCE_B = '22222222-2222-4222-8222-222222222222';",
      "const COPY_A = '33333333-3333-4333-8333-333333333333';",
      "const COPY_B = '44444444-4444-4444-8444-444444444444';",
      "const PRAYER_COPY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';",
      "const PRAYER_ORIG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';",
      "const PRAYER_SOURCE = '55555555-5555-4555-8555-555555555555';",
      "const PRAYER_COPY_ASSET = '66666666-6666-4666-8666-666666666666';",
      "const ACCEPT_SOURCE = '6780c421-4411-4114-9c27-5f433dca1c2a';",
      "const ACCEPT_COPY = 'd8b6ad31-d5e1-4c0f-9f3c-ccd7067cf120';",
      "const ACCEPT_SRC_A = '12121212-1212-4121-8121-121212121212';",
      "const ACCEPT_COPY_A = '13131313-1313-4131-8131-131313131313';",
      "const PATH_A = 'studio/author/orig/src-a/voice.wav';",
      "const PATH_B = 'studio/author/orig/src-b/gone.wav';",
      "const PATH_P = 'studio/author/orig/src-p/prayer.wav';",
      "const scenario = " + JSON.stringify(scenario) + ";",
      "const PREFIX_HIT = '3832ded1-aaaa-4aaa-8aaa-bbbbbbbbbbbb';",
      "const projects = [",
      "  { id: BROKEN, name: 'Ночной полёт — копия', status: 'active', deleted_at: null, author_id: 'author-1', guest_session_id: null, created_at: '2026-09-08T12:00:00Z', project_data: { tracks: [] } },",
      "  { id: ORIGINAL, name: 'Ночной полёт', status: 'active', deleted_at: null, author_id: 'author-1', guest_session_id: null, created_at: '2026-09-01T12:00:00Z', project_data: { tracks: [{ id: 't1', assetId: SOURCE_A }, { id: 't2', assetId: SOURCE_B }] } },",
      "  { id: PRAYER_COPY, name: 'Молитва от уныния и депрессии — копия', status: 'active', deleted_at: null, author_id: 'author-1', guest_session_id: null, created_at: '2026-09-08T14:00:00Z', project_data: { tracks: [] } },",
      "  { id: PRAYER_ORIG, name: 'Молитва от уныния и депрессии', status: 'active', deleted_at: null, author_id: 'author-1', guest_session_id: null, created_at: '2026-09-01T14:00:00Z', project_data: { tracks: [{ id: 'pt1', assetId: PRAYER_SOURCE }] } },",
      "  { id: ACCEPT_SOURCE, name: 'Молитва от уныния и депрессии', status: 'active', deleted_at: null, author_id: 'author-1', guest_session_id: null, created_at: '2026-09-01T15:00:00Z', project_data: { tracks: [{ id: 'at1', assetId: ACCEPT_SRC_A }] } },",
      "  { id: ACCEPT_COPY, name: 'Молитва от уныния и депрессии — копия 2', status: 'active', deleted_at: null, author_id: 'author-1', guest_session_id: null, created_at: '2026-09-08T15:00:00Z', project_data: { tracks: [] } },",
      "];",
      "if (scenario === 'with_parent_column') {",
      "  projects[0].duplicated_from = ORIGINAL;",
      "}",
      "if (scenario === 'project_missing' || scenario === 'project_query_error') {",
      "  projects.splice(0, 1);",
      "  projects.push({ id: PREFIX_HIT, name: 'prefix-near-miss', status: 'deleted', deleted_at: '2026-09-01T00:00:00Z', author_id: 'author-1', guest_session_id: null, created_at: '2026-08-01T00:00:00Z' });",
      "}",
      "const assets = [",
      "  { id: COPY_A, project_id: BROKEN, source_id: SOURCE_A, original_name: 'voice.wav', upload_state: 'reserved', deleted_at: null, storage_path: PATH_A, created_at: '2026-09-08T12:00:01Z' },",
      "  { id: COPY_B, project_id: BROKEN, source_id: SOURCE_B, original_name: 'deleted-take.wav', upload_state: 'reserved', deleted_at: '2026-09-08T13:00:00Z', storage_path: PATH_B, created_at: '2026-09-08T12:00:02Z' },",
      "  { id: SOURCE_A, project_id: ORIGINAL, source_id: SOURCE_A, original_name: 'voice.wav', upload_state: 'ready', deleted_at: null, storage_path: PATH_A, created_at: '2026-09-01T12:00:01Z' },",
      "  { id: SOURCE_B, project_id: ORIGINAL, source_id: SOURCE_B, original_name: 'deleted-take.wav', upload_state: 'ready', deleted_at: null, storage_path: PATH_B, created_at: '2026-09-01T12:00:02Z' },",
      "  { id: PRAYER_COPY_ASSET, project_id: PRAYER_COPY, source_id: PRAYER_SOURCE, original_name: 'prayer.wav', upload_state: 'reserved', deleted_at: null, storage_path: PATH_P, created_at: '2026-09-08T14:00:01Z' },",
      "  { id: PRAYER_SOURCE, project_id: PRAYER_ORIG, source_id: PRAYER_SOURCE, original_name: 'prayer.wav', upload_state: 'ready', deleted_at: null, storage_path: PATH_P, created_at: '2026-09-01T14:00:01Z' },",
      "  { id: ACCEPT_SRC_A, project_id: ACCEPT_SOURCE, source_id: ACCEPT_SRC_A, original_name: 'prayer.wav', upload_state: 'ready', deleted_at: null, storage_path: PATH_P, created_at: '2026-09-01T15:00:01Z' },",
      "  { id: ACCEPT_COPY_A, project_id: ACCEPT_COPY, source_id: ACCEPT_SRC_A, original_name: 'prayer.wav', upload_state: 'ready', deleted_at: null, storage_path: PATH_P, created_at: '2026-09-08T15:00:01Z' },",
      "];",
      "if (scenario === 'ready_repaired') {",
      "  assets[0].upload_state = 'ready';",
      "}",
      "const sources = [",
      "  { id: SOURCE_A, storage_path: PATH_A, deleted_at: null },",
      "  { id: SOURCE_B, storage_path: PATH_B, deleted_at: null },",
      "  { id: PRAYER_SOURCE, storage_path: PATH_P, deleted_at: null },",
      "  { id: ACCEPT_SRC_A, storage_path: PATH_P, deleted_at: null },",
      "];",
      "const auditEvents = [",
      "  { id: 'audit-old', created_at: '2026-09-08T12:00:00Z', action: 'studio_project_duplicated', resource_type: 'studio_project', resource_id: BROKEN, metadata: { source_project_id: ORIGINAL } },",
      "  { id: 'audit-prayer', created_at: '2026-09-08T14:00:00Z', action: 'studio_project_duplicated', resource_type: 'studio_project', resource_id: PRAYER_COPY, metadata: { source_project_id: PRAYER_ORIG, project_name: 'Молитва от уныния и депрессии — копия' } },",
      "];",
      "const storageNames = scenario === 'missing_object' ? ['voice.wav'] : ['voice.wav', 'gone.wav', 'prayer.wav'];",
      "function applyFilters(rows, filters) {",
      "  return rows.filter((row) => filters.every((f) => {",
      "    if (f.op === 'eq') return String(row[f.col]) === String(f.val);",
      "    if (f.op === 'in') return (f.val || []).includes(row[f.col]);",
      "    if (f.op === 'is') return f.val == null ? row[f.col] == null : row[f.col] === f.val;",
      "    if (f.op === 'not') {",
      "      if (f.innerOp === 'is' && f.val == null) return row[f.col] != null;",
      "      return true;",
      "    }",
      "    if (f.op === 'ilike') {",
      "      const pattern = String(f.val || '').toLowerCase();",
      "      const value = String(row[f.col] || '').toLowerCase();",
      "      const raw = pattern.replace(/%/g, '');",
      "      if (pattern.startsWith('%') && pattern.endsWith('%') && pattern.length >= 2) return value.includes(raw);",
      "      if (pattern.endsWith('%')) return value.startsWith(raw);",
      "      if (pattern.startsWith('%')) return value.endsWith(raw);",
      "      return value === raw;",
      "    }",
      "    return true;",
      "  }));",
      "}",
      "function createClient() {",
      "  return {",
      "    from(table) {",
      "      const state = { table, filters: [] };",
      "      const api = {",
      "        select() { return api; },",
      "        eq(col, val) { state.filters.push({ op: 'eq', col, val }); return api; },",
      "        in(col, val) { state.filters.push({ op: 'in', col, val }); return api; },",
      "        ilike(col, val) { state.filters.push({ op: 'ilike', col, val }); return api; },",
      "        is(col, val) { state.filters.push({ op: 'is', col, val }); return api; },",
      "        not(col, innerOp, val) { state.filters.push({ op: 'not', col, innerOp, val }); return api; },",
      "        order() { return api; },",
      "        limit() { return api; },",
      "        range() { return api; },",
      "        then(resolve) {",
      "          if (scenario === 'project_query_error' && table === 'studio_projects' && state.filters.some((f) => f.op === 'eq' && f.col === 'id')) {",
      "            resolve({ data: null, error: { message: 'simulated project lookup failed PGRST116' } });",
      "            return;",
      "          }",
      "          let rows = [];",
      "          if (table === 'studio_projects') rows = projects;",
      "          if (table === 'studio_project_assets') rows = assets;",
      "          if (table === 'studio_asset_sources') rows = sources;",
      "          if (table === 'author_support_audit_events') rows = auditEvents;",
      "          resolve({ data: applyFilters(rows, state.filters), error: null });",
      "        },",
      "      };",
      "      return api;",
      "    },",
      "    storage: {",
      "      from(bucket) {",
      "        if (bucket !== 'studio-draft-assets') {",
      "          return {",
      "            list() { return Promise.resolve({ data: [], error: null }); },",
      "            info() { return Promise.resolve({ data: null, error: { message: 'missing' } }); },",
      "            createSignedUrl() { throw new Error('createSignedUrl must not be called'); },",
      "          };",
      "        }",
      "        return {",
      "          list(_prefix, opts) {",
      "            const search = String((opts && opts.search) || '');",
      "            const data = storageNames.filter((name) => name === search).map((name) => ({ name, metadata: { size: 12 } }));",
      "            return Promise.resolve({ data, error: null });",
      "          },",
      "          info(path) {",
      "            const name = String(path || '').split('/').pop();",
      "            if (storageNames.includes(name)) return Promise.resolve({ data: { name }, error: null });",
      "            return Promise.resolve({ data: null, error: { message: 'not_found' } });",
      "          },",
      "          createSignedUrl() { throw new Error('createSignedUrl must not be called'); },",
      "        };",
      "      },",
      "    },",
      "  };",
      "}",
      "module.exports = { createClient };",
      "",
    ].join("\n"),
  );
  return {
    deployRoot: join(root, "deploy"),
    releaseCurrent,
  };
}

function studioDupAssetDiagEnv(fixture, extraEnv = {}) {
  const env = {
    ...process.env,
    DEPLOY_ROOT: fixture.deployRoot,
  };
  delete env.AUDIOLAD_DUP_ASSET_PROJECT_ID;
  delete env.AUDIOLAD_DUP_VERIFY_PROJECT_ID;
  delete env.AUDIOLAD_DUP_VERIFY_SOURCE_PROJECT_ID;
  Object.assign(env, extraEnv);
  return env;
}

function runStudioDupAssetDiagHelper(root, fixture, extraEnv = {}) {
  return spawnSync("bash", [studioDupAssetDiagPath], {
    encoding: "utf8",
    timeout: 20000,
    env: studioDupAssetDiagEnv(fixture, extraEnv),
  });
}

function runStudioDupAssetDiagViaStdin(scriptText, fixture, extraEnv = {}) {
  return spawnSync("bash", ["-s", "a".repeat(40), "b".repeat(40)], {
    encoding: "utf8",
    timeout: 20000,
    input: scriptText,
    env: studioDupAssetDiagEnv(fixture, extraEnv),
  });
}

function assertStudioDupAssetDiagHelper(workflowText) {
  const helperText = readFileSync(studioDupAssetDiagPath, "utf8");
  const syntax = spawnSync("bash", ["-n", studioDupAssetDiagPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `studio dup-asset diag helper bash -n failed: ${syntax.stderr}`);
  assert.match(helperText, /OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
  assert.match(helperText, /3832ded1-4100-4478-a8d4-7fc6a635f72e/);
  assert.match(helperText, /d8b6ad31-d5e1-4c0f-9f3c-ccd7067cf120/);
  assert.match(helperText, /6780c421-4411-4114-9c27-5f433dca1c2a/);
  assert.match(helperText, /AUDIOLAD_DUP_ASSET_PROJECT_ID/);
  assert.match(helperText, /AUDIOLAD_DUP_VERIFY_PROJECT_ID/);
  assert.match(helperText, /AUDIOLAD_DUP_VERIFY_SOURCE_PROJECT_ID/);
  assert.match(helperText, /BROKEN_PROJECT_ID=/);
  assert.match(helperText, /VERIFY_PROJECT_ID=/);
  assert.match(helperText, /VERIFY_ALL_READY=/);
  assert.match(helperText, /VERIFY_SOURCE_ID_REUSE=/);
  assert.match(helperText, /ORIGINAL_REFS_READY=/);
  assert.match(helperText, /BROKEN_SHARED_REFS_COUNT=/);
  assert.match(helperText, /3832DED1_FOUND=/);
  assert.match(helperText, /DUPLICATION_AUDIT_PROJECT_ID=/);
  assert.match(helperText, /author_support_audit_events/);
  assert.match(helperText, /loadEnvConfig\(dir, false, silent, true\)/);
  assert.doesNotMatch(helperText, /createSignedUrl/);
  assert.doesNotMatch(helperText, /\/usr\/local\/sbin\/audiolad-deploy/);
  assert.doesNotMatch(helperText, /pm2 delete/);
  assert.doesNotMatch(helperText, /DELETE FROM/i);
  const helperCode = helperText
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(helperCode, /\bsource\s+[^\n]*\.env\.production/);
  assert.doesNotMatch(helperText, /cat\s+[^\n]*\.(env\.production|env\.local)/);
  chmodSync(studioDupAssetDiagPath, 0o755);

  const secretUrl = "https://dup-asset-diag-test.example.invalid";
  const secretKey = "super-secret-service-role-key-do-not-log";
  const root = mkdtempSync(join(tmpdir(), "audiolad-studio-dup-asset-diag-"));
  try {
    const fixture = writeStudioDupAssetDiagFixture(root, { secretUrl, secretKey });
    const result = runStudioDupAssetDiagHelper(root, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `studio dup-asset diag helper failed: ${output}`);
    assert.match(output, /confirm=OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
    assert.match(output, /CUTOVER = NO/);
    assert.match(output, /audiolad_deploy = NOT_INVOKED/);
    assert.match(output, /MODE = read_only_duplicate_asset_diag/);
    assert.match(output, /BROKEN_PROJECT_ID=3832ded1-4100-4478-a8d4-7fc6a635f72e/);
    assert.match(output, /ASSET_ROW_COUNT=2/);
    assert.match(output, /UPLOAD_STATE_COUNTS=reserved:2/);
    assert.match(output, /SOURCE_ID_NE_ID_COUNT=2/);
    assert.match(output, /ALL_RESERVED=YES/);
    assert.match(output, /SOURCE_OBJECTS_INTACT=YES/);
    assert.match(output, /ORIGINAL_PROJECT_ID=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
    assert.match(output, /ORIGINAL_REFS_READY=YES/);
    assert.match(output, /===== VERIFY LIVE ASSETS =====/);
    assert.match(output, /VERIFY_ASSET id=13131313-1313-4131-8131-131313131313 source_id=12121212-1212-4121-8121-121212121212 upload_state=ready source_id_equals_id=NO source_id_on_source_project=YES/);
    assert.match(output, /VERIFY_PROJECT_ID=d8b6ad31-d5e1-4c0f-9f3c-ccd7067cf120/);
    assert.match(output, /VERIFY_ASSET_COUNT=1/);
    assert.match(output, /VERIFY_ALL_READY=YES/);
    assert.match(output, /VERIFY_SHARED_REF_COUNT=1/);
    assert.match(output, /VERIFY_OWN_UPLOAD_COUNT=0/);
    assert.match(output, /VERIFY_SOURCE_PROJECT_ID=6780c421-4411-4114-9c27-5f433dca1c2a/);
    assert.match(output, /VERIFY_SOURCE_ID_REUSE=YES/);
    assert.match(output, /ASSET id=33333333-3333-4333-8333-333333333333/);
    assert.match(output, /deleted_at=set/);
    assert.match(output, /deleted_at=null/);
    assert.match(output, /source_exists=true/);
    assert.match(output, /storage_object_exists=true/);
    assert.match(output, /ORIGINAL_REF source_id=11111111-1111-4111-8111-111111111111/);
    assert.match(output, /ORIGINAL_PROJECT_VIA=name_heuristic\+matching_sources/);
    assert.match(output, /schema_parent_keys=none/);
    assert.match(output, /supabase_url_host=dup-asset-diag-test\.example\.invalid/);
    assert.match(output, /project_found=YES/);
    assert.match(output, /project_query_error=none/);
    assert.match(output, /asset_query_error=none/);
    assert.match(output, /BROKEN_SHARED_REFS_COUNT=2/);
    assert.match(output, /BROKEN_PROJECT_IDS=3832ded1-4100-4478-a8d4-7fc6a635f72e,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
    assert.match(output, /3832DED1_FOUND=YES/);
    assert.match(output, /DUPLICATION_AUDIT_PROJECT_ID=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
    assert.match(output, /DUPLICATION_AUDIT_SOURCE_PROJECT_ID=cccccccc-cccc-4ccc-8ccc-cccccccccccc/);
    assert.match(output, /BROKEN_REF project_id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
    assert.match(output, /source_live=YES/);
    assert.match(output, /AUDIT_TABLE=author_support_audit_events/);
    assert.match(output, /SOURCE_PROJECT id=cccccccc-cccc-4ccc-8ccc-cccccccccccc/);
    assert.match(output, /SOURCE_TRACK_ASSET_IDS=55555555-5555-4555-8555-555555555555/);
    assert.match(output, /===== GLOBAL BROKEN SHARED REFS =====/);
    assert.match(output, /===== DUPLICATION AUDIT =====/);
    assert.match(output, /===== SOURCE PROJECT CHECK =====/);
    assert.doesNotMatch(output, /createSignedUrl/);
    assert.doesNotMatch(output, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, /signedUrl/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const parentRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-dup-asset-diag-parent-"));
  try {
    const fixture = writeStudioDupAssetDiagFixture(parentRoot, {
      secretUrl,
      secretKey,
      scenario: "with_parent_column",
    });
    const result = runStudioDupAssetDiagHelper(parentRoot, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `parent-column diag failed: ${output}`);
    assert.match(output, /schema_parent_keys=duplicated_from/);
    assert.match(output, /ORIGINAL_PROJECT_VIA=column:duplicated_from/);
    assert.match(output, /ORIGINAL_PROJECT_ID=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
    assert.match(output, /ORIGINAL_REFS_READY=YES/);
  } finally {
    rmSync(parentRoot, { recursive: true, force: true });
  }

  const missingProjectRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-dup-asset-diag-noproject-"));
  try {
    const fixture = writeStudioDupAssetDiagFixture(missingProjectRoot, {
      secretUrl,
      secretKey,
      scenario: "project_missing",
    });
    const result = runStudioDupAssetDiagHelper(missingProjectRoot, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `missing-project diag failed: ${output}`);
    assert.match(output, /project_found=NO/);
    assert.match(output, /project_query_error=none/);
    assert.match(output, /PROJECT_ID_PREFIX_CANDIDATES=1/);
    assert.match(output, /PROJECT_CANDIDATE id=3832ded1-aaaa-4aaa-8aaa-bbbbbbbbbbbb/);
    assert.match(output, /ASSET_ROW_COUNT=2/);
    assert.match(output, /ASSET id=33333333-3333-4333-8333-333333333333/);
    assert.match(output, /ORIGINAL_PROJECT_VIA=matching_sources/);
    assert.match(output, /ORIGINAL_PROJECT_ID=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
    assert.match(output, /BROKEN_SHARED_REFS_COUNT=2/);
    assert.match(output, /3832DED1_FOUND=YES/);
    assert.match(output, /DUPLICATION_AUDIT_PROJECT_ID=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
    assert.match(output, /===== GLOBAL BROKEN SHARED REFS =====/);
    assert.match(output, /supabase_url_host=dup-asset-diag-test\.example\.invalid/);
    assert.doesNotMatch(output, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(missingProjectRoot, { recursive: true, force: true });
  }

  const projectErrorRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-dup-asset-diag-projerr-"));
  try {
    const fixture = writeStudioDupAssetDiagFixture(projectErrorRoot, {
      secretUrl,
      secretKey,
      scenario: "project_query_error",
    });
    const result = runStudioDupAssetDiagHelper(projectErrorRoot, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `project-query-error diag failed: ${output}`);
    assert.match(output, /project_found=ERROR/);
    assert.match(output, /project_query_error=simulated project lookup failed PGRST116/);
    assert.match(output, /PROJECT_ID_PREFIX_CANDIDATES=1/);
    assert.match(output, /ASSET_ROW_COUNT=2/);
    assert.match(output, /ASSET id=33333333-3333-4333-8333-333333333333/);
    assert.match(output, /BROKEN_SHARED_REFS_COUNT=2/);
    assert.match(output, /3832DED1_FOUND=YES/);
    assert.match(output, /DUPLICATION_AUDIT_PROJECT_ID=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
    assert.doesNotMatch(output, /DIAG_PROBE=UNAVAILABLE reason=project_query_error/);
  } finally {
    rmSync(projectErrorRoot, { recursive: true, force: true });
  }

  const missingRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-dup-asset-diag-missing-"));
  try {
    const fixture = writeStudioDupAssetDiagFixture(missingRoot, {
      secretUrl,
      secretKey,
      scenario: "missing_object",
    });
    const result = runStudioDupAssetDiagHelper(missingRoot, fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `missing-object diag failed: ${output}`);
    assert.match(output, /storage_object_exists=false/);
    assert.match(output, /SOURCE_OBJECTS_INTACT=NO/);
    assert.match(output, /ALL_RESERVED=YES/);
  } finally {
    rmSync(missingRoot, { recursive: true, force: true });
  }

  const readyRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-dup-asset-diag-ready-"));
  try {
    const fixture = writeStudioDupAssetDiagFixture(readyRoot, {
      secretUrl,
      secretKey,
      scenario: "ready_repaired",
    });
    const result = runStudioDupAssetDiagHelper(readyRoot, fixture, {
      AUDIOLAD_DUP_VERIFY_PROJECT_ID: "3832ded1-4100-4478-a8d4-7fc6a635f72e",
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `ready-repaired diag failed: ${output}`);
    assert.match(output, /ASSET id=33333333-3333-4333-8333-333333333333 source_id=11111111-1111-4111-8111-111111111111 original_name=voice.wav upload_state=ready/);
    assert.match(output, /UPLOAD_STATE_COUNTS=ready:1,reserved:1/);
    assert.match(output, /ALL_RESERVED=NO/);
    assert.match(output, /VERIFY_ASSET id=33333333-3333-4333-8333-333333333333 source_id=11111111-1111-4111-8111-111111111111 upload_state=ready source_id_equals_id=NO/);
    assert.match(output, /VERIFY_PROJECT_ID=3832ded1-4100-4478-a8d4-7fc6a635f72e/);
    assert.match(output, /VERIFY_ASSET_COUNT=1/);
    assert.match(output, /VERIFY_ALL_READY=YES/);
    assert.match(output, /VERIFY_SHARED_REF_COUNT=1/);
    assert.match(output, /VERIFY_OWN_UPLOAD_COUNT=0/);
    assert.match(output, /SOURCE_OBJECTS_INTACT=YES/);
    assert.match(output, /BROKEN_SHARED_REFS_COUNT=1/);
  } finally {
    rmSync(readyRoot, { recursive: true, force: true });
  }

  const verifyOverrideRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-dup-asset-diag-verify-"));
  try {
    const fixture = writeStudioDupAssetDiagFixture(verifyOverrideRoot, { secretUrl, secretKey });
    const result = runStudioDupAssetDiagHelper(verifyOverrideRoot, fixture, {
      AUDIOLAD_DUP_VERIFY_PROJECT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `verify-override diag failed: ${output}`);
    assert.match(output, /BROKEN_PROJECT_ID=3832ded1-4100-4478-a8d4-7fc6a635f72e/);
    assert.match(output, /VERIFY_PROJECT_ID=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
    assert.match(output, /VERIFY_ASSET id=11111111-1111-4111-8111-111111111111 source_id=11111111-1111-4111-8111-111111111111 upload_state=ready source_id_equals_id=YES/);
    assert.match(output, /VERIFY_ASSET id=22222222-2222-4222-8222-222222222222 source_id=22222222-2222-4222-8222-222222222222 upload_state=ready source_id_equals_id=YES/);
    assert.match(output, /VERIFY_ASSET_COUNT=2/);
    assert.match(output, /VERIFY_ALL_READY=YES/);
    assert.match(output, /VERIFY_SHARED_REF_COUNT=0/);
    assert.match(output, /VERIFY_OWN_UPLOAD_COUNT=2/);
  } finally {
    rmSync(verifyOverrideRoot, { recursive: true, force: true });
  }

  const remoteRoot = mkdtempSync(join(tmpdir(), "audiolad-studio-dup-asset-diag-remote-"));
  try {
    const fixture = writeStudioDupAssetDiagFixture(remoteRoot, { secretUrl, secretKey });
    const remote = extractRemoteStudioDupAssetDiagScript(workflowText);
    const remoteResult = runStudioDupAssetDiagViaStdin(remote, fixture);
    const remoteOutput = `${remoteResult.stdout ?? ""}${remoteResult.stderr ?? ""}`;
    assert.equal(remoteResult.status, 0, `workflow bash -s dup-asset diag failed: ${remoteOutput}`);
    assert.match(remoteOutput, /confirm=OPS_STUDIO_DUPLICATE_ASSET_DIAG/);
    assert.match(remoteOutput, /ORIGINAL_REFS_READY=YES/);
    assert.match(remoteOutput, /BROKEN_PROJECT_ID=3832ded1-4100-4478-a8d4-7fc6a635f72e/);
    assert.match(remoteOutput, /VERIFY_PROJECT_ID=d8b6ad31-d5e1-4c0f-9f3c-ccd7067cf120/);
    assert.match(remoteOutput, /VERIFY_ALL_READY=YES/);
    assert.match(remoteOutput, /VERIFY_SHARED_REF_COUNT=1/);
    assert.match(remoteOutput, /VERIFY_SOURCE_ID_REUSE=YES/);
    assert.match(remoteOutput, /VERIFY_ASSET_COUNT=1/);
    assert.match(remoteOutput, /BROKEN_SHARED_REFS_COUNT=2/);
    assert.match(remoteOutput, /DUPLICATION_AUDIT_PROJECT_ID=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
    assert.doesNotMatch(remoteOutput, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(remoteOutput, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(remoteRoot, { recursive: true, force: true });
  }
}

function assertCourseUpgradeDiag(workflowText, docsText, workflow) {
  const required = [
    "OPS_COURSE_UPGRADE_DIAG",
    "origin_main_sha",
    "audiolad-course-upgrade-diag.sh",
    "application/vnd.github.raw+json",
    "bash -s --",
    "confirm=OPS_COURSE_UPGRADE_DIAG",
  ];
  for (const needle of required) {
    assert.match(
      workflowText,
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `course-upgrade diag workflow must contain ${needle}`,
    );
  }
  assert.doesNotMatch(
    workflowText,
    /REMOTE_COURSE_UPGRADE_DIAG/,
    "workflow must not embed a duplicated course-upgrade diag heredoc",
  );
  assert.doesNotMatch(workflowText, /\.readlines\s*\(/);
  assert.doesNotMatch(workflowText, /\bMATCH_LINE\b/);

  const courseUpgradeStart = workflowText.indexOf("name: Ops course upgrade diagnostic");
  const deployStart = workflowText.indexOf("name: Deploy to production");
  const dupStart = workflowText.indexOf("name: Ops Studio duplicate asset diagnostic");
  assert.ok(
    courseUpgradeStart >= 0 && deployStart > courseUpgradeStart,
    "course-upgrade diag job must precede deploy job",
  );
  const courseJob = workflowText.slice(courseUpgradeStart, deployStart);
  const dupJob = workflowText.slice(dupStart, courseUpgradeStart);
  const diagnoseJob = workflowText.slice(
    workflowText.indexOf("name: Production read-only diagnostics"),
    workflowText.indexOf("name: Ops Studio worker recover"),
  );
  const deployJob = workflowText.slice(deployStart);
  assert.doesNotMatch(
    courseJob,
    /sudo -n \/usr\/local\/sbin\/audiolad-deploy/,
    "course-upgrade diag job must not invoke audiolad-deploy",
  );
  assert.doesNotMatch(courseJob, /pm2 delete/, "course-upgrade diag job must stay read-only");
  assert.doesNotMatch(courseJob, /pm2 start/, "course-upgrade diag job must not start PM2 apps");
  assert.doesNotMatch(courseJob, /pm2 (restart|flush|save)/, "course-upgrade diag job must not mutate PM2");
  assert.doesNotMatch(courseJob, /\bnginx\s+-s\b/, "course-upgrade diag must not signal nginx");
  const courseCode = courseJob
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(courseCode, /\bdeploy\.sh\b/, "course-upgrade diag job must not call deploy.sh");
  assert.doesNotMatch(courseJob, /actions\/checkout/);
  assert.doesNotMatch(courseJob, /persist-credentials/);
  assert.doesNotMatch(courseCode, /\bgit checkout\b/);
  assert.doesNotMatch(courseCode, /\bgit clone\b/);
  assert.doesNotMatch(courseCode, /\bgit worktree\b/);
  assert.doesNotMatch(courseCode, /\bgit submodule\b/);
  assert.doesNotMatch(courseJob, /github\.ref\b/);
  assert.doesNotMatch(courseJob, /github\.head_ref/);
  assert.doesNotMatch(courseJob, /github\.sha\b/);
  assert.doesNotMatch(courseJob, /github\.event\.pull_request/);
  assert.doesNotMatch(courseJob, /[?&]ref=main\b/);
  assert.doesNotMatch(courseJob, /[?&]ref=\$\{\{\s*github\./);
  assert.match(
    courseJob,
    /contents\/deploy\/scripts\/audiolad-course-upgrade-diag\.sh\?ref=\$\{ORIGIN_MAIN_SHA\}/,
  );
  assert.match(courseJob, /Accept:\s+application\/vnd\.github\.raw\+json/);
  assert.match(workflowText, /application\/vnd\.github\.raw\+json/);
  assert.doesNotMatch(
    "Accept: application/vnd.github.raw",
    /application\/vnd\.github\.raw\+json/,
    "exact media-type assertion must not pass on bare application/vnd.github.raw",
  );
  assert.match(
    "Accept: application/vnd.github.raw+json",
    /application\/vnd\.github\.raw\+json/,
    "exact media-type assertion must accept application/vnd.github.raw+json",
  );
  assert.doesNotMatch(
    courseJob,
    /application\/vnd\.github\.raw(?!\+json)/,
    "course job must not use bare application/vnd.github.raw without +json",
  );
  assert.doesNotMatch(
    workflowText,
    /application\/vnd\.github\.raw(?!\+json)/,
    "workflow must not use bare application/vnd.github.raw without +json",
  );
  assert.match(courseJob, /Authorization:\s+Bearer \$\{GITHUB_TOKEN\}/);
  assert.match(courseJob, /ORIGIN_MAIN_SHA:\s+\$\{\{\s*needs\.resolve\.outputs\.origin_main_sha\s*\}\}/);
  assert.match(courseJob, /\[\[ ! "\$\{ORIGIN_MAIN_SHA\}" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(courseJob, /bash -n "\$\{HELPER\}"/);
  assert.match(courseJob, /grep -F -q "OPS_COURSE_UPGRADE_DIAG" "\$\{HELPER\}"/);
  assert.match(courseJob, /"bash -s --"/);
  assert.match(courseJob, /< "\$\{COURSE_UPGRADE_HELPER\}"/);
  const fetchOffset = courseJob.indexOf("name: Fetch trusted origin/main helper");
  const bashNOffset = courseJob.indexOf('bash -n "${HELPER}"');
  const sshStepOffset = courseJob.indexOf("name: Read-only course upgrade diagnostic via SSH");
  const sshStdinOffset = courseJob.indexOf('< "${COURSE_UPGRADE_HELPER}"');
  assert.ok(fetchOffset >= 0, "course-upgrade diag must fetch the trusted helper");
  assert.ok(bashNOffset > fetchOffset, "helper bash -n must run in the fetch step");
  assert.ok(sshStepOffset > bashNOffset, "SSH must run after helper bash -n");
  assert.ok(sshStdinOffset > sshStepOffset, "SSH must pipe the fetched helper on stdin");
  assert.match(courseJob, /name: Remove trusted helper and SSH identity/);
  assert.match(courseJob, /if:\s+always\(\)/);
  assert.match(courseJob, /rm -f "\$\{COURSE_UPGRADE_HELPER\}"/);
  assert.doesNotMatch(
    courseCode,
    /\bsource\s+[^\n]*\.(env\.production|env\.local)/,
    "course-upgrade diag job must not source env files",
  );
  assert.doesNotMatch(
    courseJob,
    /cat\s+[^\n]*\.(env\.production|env\.local)/,
    "course-upgrade diag job must not cat env files",
  );
  assert.doesNotMatch(courseJob, /\btochka\b/i, "course-upgrade diag job must not call Tochka");
  assert.doesNotMatch(courseJob, /\/api\/checkout\/course-upgrade/, "course-upgrade diag job must not POST checkout");
  assert.doesNotMatch(courseJob, /\bINSERT INTO\b/i, "course-upgrade diag job must not write the DB");
  assert.doesNotMatch(courseJob, /\bUPDATE\b/i, "course-upgrade diag job must not write the DB");
  assert.doesNotMatch(courseJob, /\bDELETE FROM\b/i, "course-upgrade diag job must not write the DB");
  assert.doesNotMatch(diagnoseJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(dupJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.doesNotMatch(deployJob, /OPS_COURSE_UPGRADE_DIAG/);
  assert.match(docsText, /OPS_COURSE_UPGRADE_DIAG/);
  assert.match(docsText, /audiolad-course-upgrade-diag\.sh/);
  assert.match(docsText, /Evidence cannot be pulled until this confirm is merged/);
  assert.match(docsText, /application\/vnd\.github\.raw\+json/);
  assert.doesNotMatch(
    docsText,
    /application\/vnd\.github\.raw(?!\+json)/,
    "docs must not use bare application/vnd.github.raw without +json",
  );
  assert.match(docsText, /origin_main_sha/);
  assert.doesNotMatch(docsText, /persist-credentials/);
  assert.match(docsText, /SAFE_SUMMARY/);
  assert.match(docsText, /WEB_PID_STATUS/);
  assert.match(docsText, /UNKNOWN_PERMISSION_DENIED/);
  assert.match(docsText, /PRESENT_READABLE/);
  assert.match(docsText, /PRIVILEGED_LOGDIAG/);
  assert.match(docsText, /ENTITLEMENT_STATE_MISMATCH/);
  assert.match(docsText, /audiolad-course-upgrade-logdiag/);
  assert.match(docsText, /Do not install on production/);

  const job = workflow.jobs.course_upgrade_diag;
  assert.equal(job.environment, "production");
  assert.ok(
    job.steps.every((step) => !step.uses),
    "course_upgrade_diag must not use any GitHub Action",
  );
  assert.equal(
    job.steps.filter((step) => step.name === "Fetch trusted origin/main helper").length,
    1,
  );
  assert.equal(
    job.steps.filter((step) => step.name === "Read-only course upgrade diagnostic via SSH").length,
    1,
  );
  const cleanup = job.steps.find((step) => step.name === "Remove trusted helper and SSH identity");
  assert.ok(cleanup, "cleanup step must exist");
  assert.equal(cleanup.if, "always()");
}

function extractCourseUpgradeFetchScript(workflow) {
  const fetchStep = workflow.jobs.course_upgrade_diag.steps.find(
    (step) => step.name === "Fetch trusted origin/main helper",
  );
  assert.ok(fetchStep, "fetch trusted helper step must exist");
  assert.equal(typeof fetchStep.run, "string", "fetch step must be an inline run script");
  assert.equal(fetchStep.uses, undefined, "fetch step must not use a GitHub Action");
  return fetchStep.run;
}

function writeFakeCurl(binDir, { recordPath, bodyPath = "", exitCode = 0 }) {
  writeFileSync(
    join(binDir, "curl"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `printf '%s\\n' "$*" >> "${recordPath}"`,
      "out=''",
      'args=("$@")',
      'for ((i=0; i<${#args[@]}; i++)); do',
      '  if [[ "${args[$i]}" == "-o" ]]; then',
      '    out="${args[$((i+1))]}"',
      "  fi",
      "done",
      `if [[ -n "$out" && -n "${bodyPath}" && -f "${bodyPath}" ]]; then`,
      `  cp "${bodyPath}" "$out"`,
      "fi",
      `exit ${exitCode}`,
      "",
    ].join("\n"),
  );
  chmodSync(join(binDir, "curl"), 0o755);
}

function runCourseUpgradeFetchScript(script, { sha, token, fakeBin, extraEnv = {} }) {
  const work = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-fetch-"));
  const githubEnv = join(work, "github.env");
  writeFileSync(githubEnv, "");
  const env = {
    PATH: fakeBin ? `${fakeBin}:/usr/bin:/bin` : "/usr/bin:/bin",
    HOME: work,
    ORIGIN_MAIN_SHA: sha,
    GITHUB_ENV: githubEnv,
    LANG: "C",
    ...extraEnv,
  };
  if (token !== undefined) {
    env.GITHUB_TOKEN = token;
  }
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    timeout: 10000,
    env,
  });
  return { result, work, githubEnv };
}

function assertCourseUpgradeHelperFetchTransport(workflow) {
  const script = extractCourseUpgradeFetchScript(workflow);
  assert.match(script, /set \+x/);
  assert.doesNotMatch(script, /echo\s+.*GITHUB_TOKEN/);
  assert.doesNotMatch(script, /printf\s+.*GITHUB_TOKEN/);
  assert.doesNotMatch(script, /\bcat\s+"\$\{HELPER\}"/);
  assert.doesNotMatch(script, /\bgit\b/);
  assert.doesNotMatch(script, /actions\/checkout/);
  assert.match(
    script,
    /https:\/\/api\.github\.com\/repos\/Audiolad\/audiolad\/contents\/deploy\/scripts\/audiolad-course-upgrade-diag\.sh\?ref=\$\{ORIGIN_MAIN_SHA\}/,
  );

  const malformed = [
    "",
    "main",
    "HEAD",
    "origin/main",
    "refs/heads/main",
    "refs/pull/385/head",
    "012ff2e",
    "a".repeat(39),
    "a".repeat(41),
    "A".repeat(40),
    `${"a".repeat(40)}\n`,
    "012ff2e02529dfea3987918fb0c5a74ab110fb16X",
  ];
  for (const sha of malformed) {
    const binDir = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-curl-"));
    const recordPath = join(binDir, "curl-args.txt");
    writeFakeCurl(binDir, { recordPath, bodyPath: "" });
    const { result, work } = runCourseUpgradeFetchScript(script, {
      sha,
      token: "must-not-be-used",
      fakeBin: binDir,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    try {
      assert.notEqual(result.status, 0, `malformed SHA ${JSON.stringify(sha)} must be rejected`);
      assert.match(
        output,
        /40-character lowercase hex SHA|unbound variable|ORIGIN_MAIN_SHA/,
        `malformed SHA ${JSON.stringify(sha)} must fail closed: ${output}`,
      );
      assert.equal(existsSync(recordPath), false, `curl must not run for malformed SHA ${JSON.stringify(sha)}`);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  }

  const trustedSha = "012ff2e02529dfea3987918fb0c5a74ab110fb16";
  const goodBody = "#!/usr/bin/env bash\n# confirm=OPS_COURSE_UPGRADE_DIAG\necho ok\n";
  const cases = [
    { label: "empty helper", body: "", expectCurl: true },
    { label: "syntax-invalid helper", body: "echo (\n", expectCurl: true },
    { label: "helper without marker", body: "#!/usr/bin/env bash\necho ok\n", expectCurl: true },
  ];
  for (const testCase of cases) {
    const binDir = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-curl-"));
    const recordPath = join(binDir, "curl-args.txt");
    const bodyPath = join(binDir, "body.sh");
    writeFileSync(bodyPath, testCase.body);
    writeFakeCurl(binDir, { recordPath, bodyPath });
    const { result, work } = runCourseUpgradeFetchScript(script, {
      sha: trustedSha,
      token: "test-github-token",
      fakeBin: binDir,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    try {
      assert.notEqual(result.status, 0, `${testCase.label} must fail: ${output}`);
      assert.equal(existsSync(recordPath), true, `${testCase.label} must reach curl after SHA validation`);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  }

  const binDir = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-curl-"));
  const recordPath = join(binDir, "curl-args.txt");
  const bodyPath = join(binDir, "body.sh");
  writeFileSync(bodyPath, goodBody);
  writeFakeCurl(binDir, { recordPath, bodyPath });
  const { result, work, githubEnv } = runCourseUpgradeFetchScript(script, {
    sha: trustedSha,
    token: "test-github-token",
    fakeBin: binDir,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  try {
    assert.equal(result.status, 0, `trusted helper fetch must succeed: ${output}`);
    assert.equal(output.includes("test-github-token"), false, "fetch script must not print the token");
    assert.doesNotMatch(output, /confirm=OPS_COURSE_UPGRADE_DIAG/, "fetch script must not print the helper");
    const recorded = readFileSync(recordPath, "utf8");
    assert.match(
      recorded,
      new RegExp(
        `https://api\\.github\\.com/repos/Audiolad/audiolad/contents/deploy/scripts/audiolad-course-upgrade-diag\\.sh\\?ref=${trustedSha}`,
      ),
    );
    assert.match(recorded, /Accept: application\/vnd\.github\.raw\+json/);
    assert.doesNotMatch(
      recorded,
      /application\/vnd\.github\.raw(?!\+json)/,
      "fetched Accept header must not use bare application/vnd.github.raw without +json",
    );
    assert.match(recorded, /Authorization: Bearer test-github-token/);
    assert.doesNotMatch(recorded, /[?&]ref=main\b/);
    assert.doesNotMatch(recorded, /refs\/heads\//);
    assert.doesNotMatch(recorded, /refs\/pull\//);
    const envText = readFileSync(githubEnv, "utf8");
    assert.match(envText, /^COURSE_UPGRADE_HELPER=/m);
  } finally {
    rmSync(binDir, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
}

function writeFakeProcTree(procRoot, { webPid = 1001, extraParents = 0 } = {}) {
  mkdirSync(procRoot, { recursive: true });
  writeFileSync(join(procRoot, "stat"), "btime 1700000000\n");
  const chain = [webPid];
  let current = webPid;
  for (let i = 0; i < extraParents; i += 1) {
    current += 1;
    chain.push(current);
  }
  chain.push(1);
  for (let i = 0; i < chain.length; i += 1) {
    const pid = chain[i];
    const ppid = i + 1 < chain.length ? chain[i + 1] : 0;
    const dir = join(procRoot, String(pid));
    mkdirSync(dir, { recursive: true });
    const comm = pid === webPid ? "next-server" : pid === 1 ? "systemd" : `parent${pid}`;
    writeFileSync(
      join(dir, "status"),
      [`Name:\t${comm}`, `PPid:\t${ppid}`, `Uid:\t0\t0\t0\t0`, ""].join("\n"),
    );
    writeFileSync(join(dir, "comm"), `${comm}\n`);
    writeFileSync(
      join(dir, "stat"),
      `${pid} (${comm}) S ${ppid} ${pid} ${pid} 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n`,
    );
    symlinkSync("/usr/bin/node", join(dir, "exe"));
  }
  return { webPid, parentPids: chain.slice(1) };
}

function writeCourseUpgradeDiagFixture(root, { secretUrl, secretKey, entitlementMode = "present" } = {}) {
  const releaseCurrent = "20260910-045134-ac9020e1050f5702fd806d29677aa4212ee68d39";
  const currentDir = join(root, "deploy", "releases", releaseCurrent);
  const sharedDir = join(root, "deploy", "shared");
  const binDir = join(root, "bin");
  const pm2Dir = join(root, "home", ".pm2", "logs");
  const procRoot = join(root, "proc");
  const webPid = 1001;
  writeFakeProcTree(procRoot, { webPid, extraParents: 1 });
  mkdirSync(join(currentDir, "node_modules", "@next", "env"), { recursive: true });
  mkdirSync(join(currentDir, "node_modules", "@supabase", "supabase-js"), { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(pm2Dir, { recursive: true });
  writeFileSync(join(currentDir, ".deploy-commit"), "ac9020e1050f5702fd806d29677aa4212ee68d39\n");
  writeFileSync(
    join(sharedDir, ".env.production"),
    `NEXT_PUBLIC_SUPABASE_URL=${secretUrl}\nSUPABASE_SERVICE_ROLE_KEY=${secretKey}\n`,
  );
  symlinkSync(join(sharedDir, ".env.production"), join(currentDir, ".env.production"));
  symlinkSync(currentDir, join(root, "deploy", "current"));
  writeFileSync(
    join(currentDir, "node_modules", "@next", "env", "package.json"),
    JSON.stringify({ name: "@next/env", main: "index.js" }),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@next", "env", "index.js"),
    [
      "const fs = require('fs');",
      "const path = require('path');",
      "function loadEnvConfig(dir) {",
      "  const file = path.join(dir, '.env.production');",
      "  const text = fs.readFileSync(file, 'utf8');",
      "  for (const line of text.split('\\n')) {",
      "    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);",
      "    if (m) process.env[m[1]] = m[2];",
      "  }",
      "}",
      "module.exports = { loadEnvConfig };",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@supabase", "supabase-js", "package.json"),
    JSON.stringify({ name: "@supabase/supabase-js", main: "index.js" }),
  );
  writeFileSync(
    join(currentDir, "node_modules", "@supabase", "supabase-js", "index.js"),
    [
      "const AUTHOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';",
      "const PRACTICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';",
      "const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';",
      "const ORDER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';",
      "const PAYMENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';",
      "const authors = [{ id: AUTHOR, slug: 'sergey-and-zoya' }];",
      "const practices = [{ id: PRACTICE, slug: 'kody-zhenskoy-prityagatelnosti', author_id: AUTHOR }];",
      "const profiles = [{ id: USER, email: 'petpovss@yandex.ru' }];",
      `const entitlements = ${JSON.stringify(
        entitlementMode === "present"
          ? [
              {
                user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                practice_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                access_level: 1,
                access_source: "purchase",
                granted_at: "2026-09-01T12:00:00Z",
              },
            ]
          : [],
      )};`,
      `const orders = ${JSON.stringify(
        [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            practice_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "pending",
            order_kind: "course_upgrade",
            target_access_level: 2,
            amount_minor: 222200,
            currency: "RUB",
            created_at: "2026-09-10T04:36:00Z",
            paid_at: null,
            practice_slug_snapshot: "kody-zhenskoy-prityagatelnosti",
          },
          ...(entitlementMode === "mismatch"
            ? [
                {
                  id: "abababab-abab-4aba-8aba-abababababab",
                  user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  practice_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                  status: "paid",
                  order_kind: "product_purchase",
                  target_access_level: null,
                  amount_minor: 19900,
                  currency: "RUB",
                  created_at: "2026-08-01T09:00:00Z",
                  paid_at: "2026-08-01T10:00:00Z",
                  practice_slug_snapshot: "kody-zhenskoy-prityagatelnosti",
                },
              ]
            : []),
        ],
      )};`,
      "const payments = [{ id: PAYMENT, order_id: ORDER, status: 'pending', provider: 'tochka', amount_minor: 222200, currency: 'RUB', created_at: '2026-09-10T04:36:01Z', confirmed_at: null, failed_at: null, provider_payment_id: null, provider_metadata: {} }];",
      `const accessLinks = ${JSON.stringify(
        entitlementMode === "mismatch"
          ? [
              {
                id: "acacacac-acac-4aca-8aca-acacacacacac",
                practice_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                status: "redeemed",
                target_access_level: 1,
                redeemed_at: "2026-07-15T12:00:00Z",
                redeemed_by_user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              },
            ]
          : [],
      )};`,
      "function applyFilters(rows, filters) {",
      "  return rows.filter((row) => filters.every((f) => {",
      "    if (f.op === 'eq') return String(row[f.col]) === String(f.val);",
      "    if (f.op === 'in') return (f.val || []).includes(row[f.col]);",
      "    return true;",
      "  }));",
      "}",
      "function createClient() {",
      "  return {",
      "    from(table) {",
      "      const state = { table, filters: [] };",
      "      const api = {",
      "        select() { return api; },",
      "        eq(col, val) { state.filters.push({ op: 'eq', col, val }); return api; },",
      "        in(col, val) { state.filters.push({ op: 'in', col, val }); return api; },",
      "        order() { return api; },",
      "        limit() { return api; },",
      "        maybeSingle() {",
      "          let rows = [];",
      "          if (table === 'authors') rows = authors;",
      "          if (table === 'practices') rows = practices;",
      "          if (table === 'profiles') rows = profiles;",
      "          if (table === 'user_practices') rows = entitlements;",
      "          const filtered = applyFilters(rows, state.filters);",
      "          return Promise.resolve({ data: filtered[0] || null, error: null });",
      "        },",
      "        then(resolve) {",
      "          let rows = [];",
      "          if (table === 'orders') rows = orders;",
      "          if (table === 'payments') rows = payments;",
      "          if (table === 'practice_access_links') rows = accessLinks;",
      "          resolve({ data: applyFilters(rows, state.filters), error: null });",
      "        },",
      "      };",
      "      return api;",
      "    },",
      "  };",
      "}",
      "module.exports = { createClient };",
      "",
    ].join("\n"),
  );

  const p3001Err = join(pm2Dir, "audiolad-p3001-error.log");
  const p3000Err = join(pm2Dir, "audiolad-p3000-error.log");
  const p3000Rotated = join(pm2Dir, "audiolad-p3000-error.log.1");
  const p3000Gz = join(pm2Dir, "audiolad-p3000-error.log.1.gz");
  const p3000BrokenGz = join(pm2Dir, "audiolad-p3000-error.log.2.gz");
  const p3000Out = join(pm2Dir, "audiolad-p3000-out.log");
  writeFileSync(join(pm2Dir, "audiolad-p3001-out.log"), "ready\n");
  writeFileSync(
    p3001Err,
    [
      "2026-09-10T05:10:00.000Z course_upgrade_failed { FAILED_STAGE: 'reload_orders_row', ACTUAL_API_ERROR: 'internal_error', ACTUAL_HTTP_STATUS: 500, order_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', practice_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', target_access_level: 2 }",
      "2026-09-10T05:10:01.000Z course_upgrade_failed { FAILED_STAGE: 'startTochkaCheckoutForPendingOrder', ACTUAL_API_ERROR: 'auth_required', ACTUAL_HTTP_STATUS: 401, order_id: '99999999-9999-4999-8999-999999999999', practice_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', target_access_level: 3 }",
      "",
    ].join("\n"),
  );
  writeFileSync(
    p3000Err,
    [
      "2026-09-10T04:36:12.000Z course_upgrade_failed {",
      "  FAILED_STAGE: 'createTochkaPaymentOperation',",
      "  ACTUAL_API_ERROR: 'provider_checkout_failed',",
      "  ACTUAL_HTTP_STATUS: 502,",
      "  order_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',",
      "  practice_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',",
      "  target_access_level: 2,",
      "  checkout_token: 'plain-secret-value-never-print',",
      "  email: 'petpovss@yandex.ru',",
      "  payment_url: 'https://pay.tochka.example/secret-link',",
      "  authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig'",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    p3000Rotated,
    "2026-09-10T04:40:00.000Z create_payment_tochka_http_error 403 tochka_create_payment_failed\n",
  );
  writeFileSync(
    p3000Gz,
    gzipSync(
      "2026-09-10T04:36:40.000Z course_upgrade_failed { FAILED_STAGE: 'createTochkaPaymentOperation', ACTUAL_API_ERROR: 'provider_checkout_failed', ACTUAL_HTTP_STATUS: 502, order_id: '12121212-1212-4121-8121-121212121212', practice_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', target_access_level: 2 }\n",
    ),
  );
  writeFileSync(p3000BrokenGz, Buffer.from("not-a-gzip-file"));
  const largeLines = [];
  for (let i = 0; i < 50000; i += 1) {
    largeLines.push(`2026-09-10T03:00:00.000Z noise line ${i} ready ok`);
  }
  largeLines.push(
    "2026-09-10T04:36:30.000Z course_upgrade_failed { FAILED_STAGE: 'createTochkaPaymentOperation', ACTUAL_API_ERROR: 'provider_timeout', ACTUAL_HTTP_STATUS: 504, order_id: '34343434-3434-4343-8343-343434343434', practice_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', target_access_level: 2 }",
  );
  writeFileSync(p3000Out, `${largeLines.join("\n")}\n`);

  const jlist = [
    {
      name: "audiolad-p3001",
      pid: 4122354,
      pm2_env: {
        status: "online",
        restart_time: 0,
        pm_cwd: currentDir,
        pm_out_log_path: join(pm2Dir, "audiolad-p3001-out.log"),
        pm_err_log_path: p3001Err,
        pm_pid_path: join(root, "home", ".pm2", "pids", "audiolad-p3001.pid"),
      },
    },
    {
      name: "audiolad-studio-render-worker",
      pid: 99,
      pm2_env: { status: "online", restart_time: 1 },
    },
  ];
  const jlistPath = join(root, "pm2-jlist.json");
  writeFileSync(jlistPath, JSON.stringify(jlist));
  writeFileSync(
    join(binDir, "pm2"),
    [
      "#!/bin/bash",
      `if [[ "$1" == "jlist" ]]; then cat ${JSON.stringify(jlistPath)}; exit 0; fi`,
      'echo "unexpected pm2 $*" >&2',
      "exit 1",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  writeFileSync(
    join(binDir, "curl"),
    [
      "#!/bin/bash",
      'echo \'{"status":"ok","deployCommit":"ac9020e1050f5702fd806d29677aa4212ee68d39","pid":1001}\'',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  chmodSync(join(binDir, "pm2"), 0o755);
  chmodSync(join(binDir, "curl"), 0o755);
  return {
    deployRoot: join(root, "deploy"),
    home: join(root, "home"),
    binDir,
    procRoot,
    missingWrapper: join(root, "missing-privileged-wrapper"),
    p3000Err,
    p3001Err,
  };
}

function courseUpgradeDiagEnv(fixture, extraEnv = {}) {
  return {
    ...process.env,
    PATH: `${fixture.binDir}:${process.env.PATH || "/usr/bin"}`,
    HOME: fixture.home,
    PM2_HOME: join(fixture.home, ".pm2"),
    DEPLOY_ROOT: fixture.deployRoot,
    AUDIOLAD_COURSE_UPGRADE_DIAG_HEALTH_URL: "http://127.0.0.1:9/health-unused",
    AUDIOLAD_COURSE_UPGRADE_DIAG_PROC_ROOT: fixture.procRoot,
    AUDIOLAD_COURSE_UPGRADE_LOGDIAG_WRAPPER: fixture.missingWrapper,
    AUDIOLAD_COURSE_UPGRADE_DIAG_SUDO: join(fixture.binDir, "sudo-not-used"),
    ...extraEnv,
  };
}

function runCourseUpgradeDiagHelper(fixture, extraEnv = {}) {
  return spawnSync("bash", [courseUpgradeDiagPath], {
    encoding: "utf8",
    timeout: 30000,
    env: courseUpgradeDiagEnv(fixture, extraEnv),
  });
}

function assertCourseUpgradeDiagOutput(output, { secretUrl, secretKey }) {
  assert.match(output, /confirm=OPS_COURSE_UPGRADE_DIAG/);
  assert.match(output, /CUTOVER = NO/);
  assert.match(output, /audiolad_deploy = NOT_INVOKED/);
  assert.match(output, /checkout_post = NOT_INVOKED/);
  assert.match(output, /tochka_calls = NOT_INVOKED/);
  assert.match(output, /entitlement_writes = NOT_INVOKED/);
  assert.match(output, /MODE = read_only_course_upgrade_diag/);
  assert.match(output, /ACTIVE_P30_COUNT=1/);
  assert.match(output, /ACTIVE_P30_NAMES=audiolad-p3001/);
  assert.match(output, /ACTIVE_P30_APP name=audiolad-p3001 status=online/);
  assert.match(output, /p3000_orphaned_or_unlisted|p3000_rotated_orphaned_or_unlisted|p3000_gz_orphaned_or_unlisted/);
  assert.match(
    output,
    /SAFE_SUMMARY window=priority[^\n]*event=course_upgrade_failed[^\n]*FAILED_STAGE=createTochkaPaymentOperation[^\n]*ACTUAL_API_ERROR=provider_checkout_failed[^\n]*ACTUAL_HTTP_STATUS=502[^\n]*order_id=dddddddd-dddd-4ddd-8ddd-dddddddddddd[^\n]*practice_id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb[^\n]*target_access_level=2/,
  );
  assert.match(output, /order_id=12121212-1212-4121-8121-121212121212/);
  assert.match(output, /order_id=34343434-3434-4343-8343-343434343434/);
  assert.match(output, /SAFE_SUMMARY window=recent/);
  const singleLineSummaries = output
    .split("\n")
    .filter((line) => line.includes("SAFE_SUMMARY") && line.includes("window=recent"));
  const firstClosed = singleLineSummaries.find(
    (line) =>
      line.includes("FAILED_STAGE=reload_orders_row") &&
      line.includes("order_id=ffffffff-ffff-4fff-8fff-ffffffffffff"),
  );
  const secondClosed = singleLineSummaries.find(
    (line) =>
      line.includes("FAILED_STAGE=startTochkaCheckoutForPendingOrder") &&
      line.includes("order_id=99999999-9999-4999-8999-999999999999"),
  );
  assert.ok(firstClosed, "closed single-line course_upgrade_failed must emit its own SAFE_SUMMARY");
  assert.match(firstClosed, /ACTUAL_API_ERROR=internal_error/);
  assert.match(firstClosed, /ACTUAL_HTTP_STATUS=500/);
  assert.match(firstClosed, /practice_id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
  assert.match(firstClosed, /target_access_level=2/);
  assert.doesNotMatch(firstClosed, /startTochkaCheckoutForPendingOrder/);
  assert.doesNotMatch(firstClosed, /auth_required/);
  assert.doesNotMatch(firstClosed, /ACTUAL_HTTP_STATUS=401/);
  assert.doesNotMatch(firstClosed, /99999999-9999-4999-8999-999999999999/);
  assert.doesNotMatch(firstClosed, /aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.doesNotMatch(firstClosed, /target_access_level=3/);
  assert.ok(secondClosed, "next diagnostic event must appear as a separate SAFE_SUMMARY");
  assert.match(secondClosed, /ACTUAL_API_ERROR=auth_required/);
  assert.match(secondClosed, /ACTUAL_HTTP_STATUS=401/);
  assert.match(secondClosed, /practice_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.match(secondClosed, /target_access_level=3/);
  assert.doesNotMatch(secondClosed, /reload_orders_row/);
  assert.doesNotMatch(secondClosed, /internal_error/);
  assert.doesNotMatch(secondClosed, /ffffffff-ffff-4fff-8fff-ffffffffffff/);
  assert.doesNotMatch(secondClosed, /target_access_level=2/);
  assert.match(output, /FAILED_STAGE=reload_orders_row/);
  assert.match(output, /FAILED_STAGE=startTochkaCheckoutForPendingOrder/);
  assert.match(output, /provider_http_status=403/);
  assert.match(output, /provider_error_code=tochka_create_payment_failed/);
  assert.match(output, /kind=p3000_gz_orphaned_or_unlisted|kind=p3000_gz/);
  assert.match(output, /compressed_log_error|log_unreadable/);
  assert.match(output, /DB_CORRELATION=OK/);
  assert.match(output, /access_level=1/);
  assert.match(output, /practice_id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
  assert.match(output, /ORDER id=dddddddd-dddd-4ddd-8ddd-dddddddddddd status=pending/);
  assert.match(output, /target_access_level=2 amount_minor=222200/);
  assert.match(output, /has_payment_url=NO/);
  assert.match(output, /has_checkout_token=NO/);
  assert.match(output, /has_provider_metadata=NO/);
  assert.match(output, /qa_listener=hardcoded_redacted/);
  assert.match(output, /WEB_PID_STATUS=OK/);
  assert.match(output, /web_pid=1001/);
  assert.match(output, /WEB_PROCESS pid=1001 ppid=1002 euser=\S+ uid=0 comm=next-server exe=node/);
  assert.match(output, /PARENT depth=1 pid=1002/);
  assert.match(output, /PARENT_CHAIN_BOUND=6/);
  assert.match(output, /LIVE_WEB_OWNER=/);
  assert.match(output, /LIVE_WEB_PM2_HOME=\/root\/\.pm2/);
  assert.match(output, /pm2_jlist_namespace=ssh_user/);
  assert.match(output, /ACTIVE_P30_COUNT=0 may be true for this namespace/);
  assert.match(output, /log_dir path=\/root\/\.pm2\/logs state=(PRESENT_READABLE|PRESENT_NOT_READABLE|ABSENT_PROVEN|UNKNOWN_PERMISSION_DENIED)/);
  assert.doesNotMatch(output, /log_dir path=\/root\/\.pm2\/logs exists=NO/);
  assert.match(output, /PRIVILEGED_LOGDIAG=MISSING/);
  assert.match(output, /NEED_INSTALL=YES/);
  assert.match(output, /ENTITLEMENT_STATE_MISMATCH=NO/);
  assert.match(output, /canonical_user_practices=PRESENT/);
  assert.match(output, /privileged_wrapper_install = NOT_INVOKED/);
  assert.doesNotMatch(output, /cmdline=/);
  assert.doesNotMatch(output, /\/environ/);
  assert.doesNotMatch(output, /\bMATCH_LINE\b/);
  assert.doesNotMatch(output, /plain-secret-value-never-print/);
  assert.doesNotMatch(output, /petpovss@yandex\.ru/);
  assert.doesNotMatch(output, /user_id=/);
  assert.doesNotMatch(output, /cccccccc-cccc-4ccc-8ccc-cccccccccccc/);
  assert.doesNotMatch(output, /pay\.tochka\.example/);
  assert.doesNotMatch(output, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
  assert.doesNotMatch(output, /super-secret-service-role-key-do-not-log/);
  assert.doesNotMatch(output, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(output, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

function assertCourseUpgradeDiagHelper() {
  const helperText = readFileSync(courseUpgradeDiagPath, "utf8");
  const syntax = spawnSync("bash", ["-n", courseUpgradeDiagPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `course-upgrade diag helper bash -n failed: ${syntax.stderr}`);
  assert.match(helperText, /OPS_COURSE_UPGRADE_DIAG/);
  assert.match(helperText, /kody-zhenskoy-prityagatelnosti/);
  assert.match(helperText, /2026-09-10T04:25:00Z/);
  assert.match(helperText, /loadEnvConfig\(dir, false, silent, true\)/);
  assert.match(helperText, /gzip\.open\([^)]*"rt"/);
  assert.match(helperText, /handle\.readline\(\)/);
  assert.match(helperText, /PRIORITY_MAX = 40/);
  assert.match(helperText, /RECENT_MAX = 20/);
  assert.match(helperText, /LOOKAHEAD = 16/);
  assert.match(helperText, /not is_object_close\(line\)/);
  assert.match(helperText, /compressed_log_error/);
  assert.doesNotMatch(helperText, /\.readlines\s*\(/);
  assert.doesNotMatch(helperText, /\bMATCH_LINE\b/);
  assert.doesNotMatch(helperText, /createSignedUrl/);
  assert.doesNotMatch(helperText, /\/usr\/local\/sbin\/audiolad-deploy/);
  assert.doesNotMatch(helperText, /pm2 delete/);
  assert.doesNotMatch(helperText, /pm2 (restart|flush|save)/);
  assert.doesNotMatch(helperText, /DELETE FROM/i);
  assert.doesNotMatch(helperText, /UPDATE /i);
  assert.doesNotMatch(helperText, /INSERT INTO/i);
  assert.doesNotMatch(helperText, /\.update\(/);
  assert.doesNotMatch(helperText, /\.insert\(/);
  assert.doesNotMatch(helperText, /\.delete\(/);
  assert.doesNotMatch(helperText, /sudo bash/);
  assert.doesNotMatch(helperText, /NOPASSWD:\s*ALL/);
  assert.doesNotMatch(helperText, /["']cmdline["']/);
  assert.doesNotMatch(helperText, /["']environ["']/);
  assert.match(helperText, /MAX_PARENTS=6/);
  assert.match(helperText, /UNKNOWN_PERMISSION_DENIED/);
  assert.match(helperText, /PRESENT_NOT_READABLE/);
  assert.match(helperText, /ABSENT_PROVEN/);
  assert.match(helperText, /ENTITLEMENT_STATE_MISMATCH/);
  assert.match(helperText, /PRIVILEGED_LOGDIAG=MISSING/);
  const helperCode = helperText
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(helperCode, /PM2_HOME=\/root\/\.pm2/);
  assert.doesNotMatch(helperCode, /\bsource\s+[^\n]*\.env\.production/);
  assert.doesNotMatch(helperText, /cat\s+[^\n]*\.(env\.production|env\.local)/);
  assert.doesNotMatch(helperCode, /\brm -rf\b/);
  chmodSync(courseUpgradeDiagPath, 0o755);
  chmodSync(courseUpgradeLogdiagPath, 0o755);

  const secretUrl = "https://course-upgrade-diag-test.example.invalid";
  const secretKey = "super-secret-service-role-key-do-not-log";
  const root = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-diag-"));
  try {
    const fixture = writeCourseUpgradeDiagFixture(root, { secretUrl, secretKey });
    const result = runCourseUpgradeDiagHelper(fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `course-upgrade diag helper failed: ${output}`);
    assertCourseUpgradeDiagOutput(output, { secretUrl, secretKey });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const remoteRoot = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-diag-remote-"));
  try {
    const fixture = writeCourseUpgradeDiagFixture(remoteRoot, { secretUrl, secretKey });
    const remoteResult = spawnSync("bash", ["-s", "--", "a".repeat(40), "b".repeat(40)], {
      encoding: "utf8",
      timeout: 30000,
      input: readFileSync(courseUpgradeDiagPath),
      env: courseUpgradeDiagEnv(fixture),
    });
    const remoteOutput = `${remoteResult.stdout ?? ""}${remoteResult.stderr ?? ""}`;
    assert.equal(remoteResult.status, 0, `workflow bash -s -- course-upgrade diag failed: ${remoteOutput}`);
    assertCourseUpgradeDiagOutput(remoteOutput, { secretUrl, secretKey });
    assert.match(remoteOutput, /workflow_target_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  } finally {
    rmSync(remoteRoot, { recursive: true, force: true });
  }

  const rejectRoot = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-diag-pid-"));
  try {
    const fixture = writeCourseUpgradeDiagFixture(rejectRoot, { secretUrl, secretKey });
    writeFileSync(
      join(fixture.binDir, "curl"),
      ["#!/bin/bash", 'echo \'{"status":"ok","pid":"not-a-pid"}\'', ""].join("\n"),
      { mode: 0o755 },
    );
    const result = runCourseUpgradeDiagHelper(fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `pid rejection must not fail the job: ${output}`);
    assert.match(output, /WEB_PID_STATUS=REJECTED/);
    assert.match(output, /web_pid_reason=pid_not_positive_integer/);
    assert.doesNotMatch(output, /WEB_PROCESS pid=/);
    assert.match(output, /PRIVILEGED_LOGDIAG=MISSING/);
    assert.match(output, /CUTOVER = NO/);
  } finally {
    rmSync(rejectRoot, { recursive: true, force: true });
  }

  const chainRoot = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-diag-chain-"));
  try {
    const fixture = writeCourseUpgradeDiagFixture(chainRoot, { secretUrl, secretKey });
    rmSync(fixture.procRoot, { recursive: true, force: true });
    writeFakeProcTree(fixture.procRoot, { webPid: 1001, extraParents: 8 });
    const result = runCourseUpgradeDiagHelper(fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `parent chain diag failed: ${output}`);
    assert.match(output, /PARENT depth=6 pid=1007/);
    assert.doesNotMatch(output, /PARENT depth=7 /);
    assert.doesNotMatch(output, /PARENT depth=\d+ pid=1008/);
    assert.doesNotMatch(output, /PARENT depth=\d+ pid=1009/);
    assert.match(output, /PARENT_CHAIN_COUNT=6/);
    assert.match(output, /PARENT_CHAIN_BOUND=6/);
  } finally {
    rmSync(chainRoot, { recursive: true, force: true });
  }

  const mismatchRoot = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-diag-mismatch-"));
  try {
    const fixture = writeCourseUpgradeDiagFixture(mismatchRoot, {
      secretUrl,
      secretKey,
      entitlementMode: "mismatch",
    });
    const result = runCourseUpgradeDiagHelper(fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `mismatch diag failed: ${output}`);
    assert.match(output, /canonical_user_practices=MISSING/);
    assert.match(output, /ENTITLEMENT_STATE_MISMATCH=YES/);
    assert.match(output, /HISTORICAL_L1_EVIDENCE=YES/);
    assert.match(output, /HISTORICAL_L1_MECHANISMS=purchase,access_link/);
    assert.match(output, /paid_base_order_count=1/);
    assert.match(output, /redeemed_access_link_count=1/);
    assert.doesNotMatch(output, /petpovss@yandex\.ru/);
    assert.doesNotMatch(output, /user_id=/);
    assert.doesNotMatch(output, /cccccccc-cccc-4ccc-8ccc-cccccccccccc/);
    assert.doesNotMatch(output, /token_hash=/);
  } finally {
    rmSync(mismatchRoot, { recursive: true, force: true });
  }

  const unprovenRoot = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-diag-unproven-"));
  try {
    const fixture = writeCourseUpgradeDiagFixture(unprovenRoot, {
      secretUrl,
      secretKey,
      entitlementMode: "absent",
    });
    const result = runCourseUpgradeDiagHelper(fixture);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `unproven diag failed: ${output}`);
    assert.match(output, /canonical_user_practices=MISSING/);
    assert.match(output, /ENTITLEMENT_STATE_MISMATCH=UNPROVEN/);
    assert.match(output, /HISTORICAL_L1_EVIDENCE=NO/);
    assert.match(output, /HISTORICAL_L1_MECHANISMS=none/);
    assert.doesNotMatch(output, /user_id=/);
    assert.doesNotMatch(output, /petpovss@yandex\.ru/);
  } finally {
    rmSync(unprovenRoot, { recursive: true, force: true });
  }

  const pathRoot = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-diag-paths-"));
  try {
    const readable = join(pathRoot, "readable");
    const missing = join(readable, "no-such-dir");
    const denied = join(pathRoot, "denied");
    const deniedChild = join(denied, "child");
    mkdirSync(readable, { recursive: true });
    mkdirSync(denied, { recursive: true });
    chmodSync(denied, 0o000);
    const classify = `
import errno, os, stat, sys
def classify(path):
    path = os.path.abspath(path)
    try:
        st = os.stat(path)
    except FileNotFoundError:
        parent = os.path.dirname(path)
        if parent == path:
            return "ABSENT_PROVEN"
        parent_state = classify(parent)
        if parent_state in ("PRESENT_READABLE", "ABSENT_PROVEN"):
            return "ABSENT_PROVEN"
        return "UNKNOWN_PERMISSION_DENIED"
    except PermissionError:
        return "UNKNOWN_PERMISSION_DENIED"
    except OSError as err:
        if err.errno in (errno.EACCES, errno.EPERM):
            return "UNKNOWN_PERMISSION_DENIED"
        return "UNKNOWN_PERMISSION_DENIED"
    readable = os.access(path, os.R_OK)
    if stat.S_ISDIR(st.st_mode):
        if readable and os.access(path, os.X_OK):
            return "PRESENT_READABLE"
        return "PRESENT_NOT_READABLE"
    if readable:
        return "PRESENT_READABLE"
    return "PRESENT_NOT_READABLE"
print(classify(sys.argv[1]))
`;
    const runClassify = (target) => {
      const result = spawnSync("python3", ["-c", classify, target], { encoding: "utf8" });
      assert.equal(result.status, 0, `classify failed for ${target}: ${result.stderr}`);
      return (result.stdout || "").trim();
    };
    assert.equal(runClassify(readable), "PRESENT_READABLE");
    assert.equal(runClassify(missing), "ABSENT_PROVEN");
    const deniedState = runClassify(deniedChild);
    assert.ok(
      deniedState === "UNKNOWN_PERMISSION_DENIED" || deniedState === "PRESENT_NOT_READABLE",
      `denied child should not be ABSENT_PROVEN, got ${deniedState}`,
    );
    assert.notEqual(deniedState, "ABSENT_PROVEN");
    const notReadable = join(pathRoot, "closed");
    mkdirSync(notReadable, { recursive: true });
    chmodSync(notReadable, 0o000);
    const closedState = runClassify(notReadable);
    assert.ok(
      closedState === "PRESENT_NOT_READABLE" || closedState === "UNKNOWN_PERMISSION_DENIED",
      `closed dir must not be treated as absent, got ${closedState}`,
    );
    chmodSync(denied, 0o755);
    chmodSync(notReadable, 0o755);
  } finally {
    try {
      chmodSync(join(pathRoot, "denied"), 0o755);
    } catch {
      // already restored or never created
    }
    try {
      chmodSync(join(pathRoot, "closed"), 0o755);
    } catch {
      // already restored
    }
    rmSync(pathRoot, { recursive: true, force: true });
  }

  const wrapperRoot = mkdtempSync(join(tmpdir(), "audiolad-course-upgrade-logdiag-"));
  try {
    const fixture = writeCourseUpgradeDiagFixture(wrapperRoot, { secretUrl, secretKey });
    const wrapperCopy = join(fixture.binDir, "audiolad-course-upgrade-logdiag");
    writeFileSync(wrapperCopy, readFileSync(courseUpgradeLogdiagPath));
    chmodSync(wrapperCopy, 0o755);
    writeFileSync(
      join(fixture.binDir, "sudo"),
      [
        "#!/bin/bash",
        `if [[ "$1" == "-n" && "$2" == ${JSON.stringify(wrapperCopy)} && "$#" -eq 2 ]]; then`,
        `  exec "$2"`,
        "fi",
        'echo "forbidden sudo $*" >&2',
        "exit 1",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    const result = runCourseUpgradeDiagHelper(fixture, {
      AUDIOLAD_COURSE_UPGRADE_LOGDIAG_WRAPPER: wrapperCopy,
      AUDIOLAD_COURSE_UPGRADE_DIAG_SUDO: join(fixture.binDir, "sudo"),
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 0, `privileged wrapper path failed: ${output}`);
    assert.match(output, /PRIVILEGED_LOGDIAG=OK/);
    assert.doesNotMatch(output, /sudo bash/);
    assert.doesNotMatch(output, /forbidden sudo/);
  } finally {
    rmSync(wrapperRoot, { recursive: true, force: true });
  }

  const logdiagSyntax = spawnSync("bash", ["-n", courseUpgradeLogdiagPath], { encoding: "utf8" });
  assert.equal(logdiagSyntax.status, 0, `logdiag wrapper bash -n failed: ${logdiagSyntax.stderr}`);
  const logdiagText = readFileSync(courseUpgradeLogdiagPath, "utf8");
  assert.match(logdiagText, /SAFE_SUMMARY/);
  assert.match(logdiagText, /gzip\.open\([^)]*"rt"/);
  assert.doesNotMatch(logdiagText, /sudo bash/);
  assert.doesNotMatch(logdiagText, /pm2 delete/);
  assert.doesNotMatch(logdiagText, /pm2 (restart|start|flush|save)/);
  assert.doesNotMatch(logdiagText, /INSERT INTO/i);
  assert.doesNotMatch(logdiagText, /NOPASSWD:\s*ALL/);
  const rejectArgs = spawnSync("bash", [courseUpgradeLogdiagPath, "anything"], { encoding: "utf8" });
  assert.notEqual(rejectArgs.status, 0, "logdiag wrapper must reject arguments");
  assert.match(`${rejectArgs.stdout ?? ""}${rejectArgs.stderr ?? ""}`, /accepts no arguments/);
  const sudoersText = readFileSync(courseUpgradeLogdiagSudoersPath, "utf8");
  assert.match(
    sudoersText,
    /^deploy ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/audiolad-course-upgrade-logdiag$/m,
  );
  assert.doesNotMatch(sudoersText, /NOPASSWD:\s*ALL/);
  assert.doesNotMatch(sudoersText, /\*/);
}

function existsSyncSafe(path) {
  return existsSync(path);
}

main();
