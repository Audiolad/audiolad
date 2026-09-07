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
  assert.equal(jobs.deploy.environment, "production");
  assert.equal(jobs.diagnose.environment, "production");
  assert.equal(jobs.studio_worker_recover.environment, "production");
  assert.equal(jobs.disk_storage_audit.environment, "production");
  assert.equal(jobs.disk_storage_cleanup.environment, "production");
  assert.equal(jobs.deploy["runs-on"], "ubuntu-latest");
  assert.equal(jobs.diagnose["runs-on"], "ubuntu-latest");
  assert.equal(jobs.studio_worker_recover["runs-on"], "ubuntu-latest");
  assert.equal(jobs.disk_storage_audit["runs-on"], "ubuntu-latest");
  assert.equal(jobs.disk_storage_cleanup["runs-on"], "ubuntu-latest");
  assert.match(workflowText, /if: inputs\.confirm == 'DO_NOT_DEPLOY'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_STUDIO_WORKER_RECOVER'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_DISK_STORAGE_AUDIT'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_DISK_STORAGE_CLEANUP'/);
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

  assert.doesNotMatch(workflowText, /actions\/checkout/);
  assert.doesNotMatch(workflowText, /git submodule/);
  assert.doesNotMatch(workflowText, /\bgit checkout\b/);
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
  assert.ok(auditStart >= 0 && deployStart > auditStart, "audit job must precede deploy job");
  assert.ok(cleanupStart > auditStart && deployStart > cleanupStart, "cleanup job must sit between audit and deploy");
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
  assert.ok(cleanupStart >= 0 && deployStart > cleanupStart, "cleanup job must precede deploy job");
  const cleanupJob = workflowText.slice(cleanupStart, deployStart);
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
  { secretUrl, secretKey, currentIsAllowlisted = false, extraAssets = [], denyReleaseRm = false },
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
      author_id: null,
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

function existsSyncSafe(path) {
  return existsSync(path);
}

main();
