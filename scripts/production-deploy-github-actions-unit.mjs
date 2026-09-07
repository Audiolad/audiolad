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
  assert.equal(jobs.deploy.environment, "production");
  assert.equal(jobs.diagnose.environment, "production");
  assert.equal(jobs.studio_worker_recover.environment, "production");
  assert.equal(jobs.deploy["runs-on"], "ubuntu-latest");
  assert.equal(jobs.diagnose["runs-on"], "ubuntu-latest");
  assert.equal(jobs.studio_worker_recover["runs-on"], "ubuntu-latest");
  assert.match(workflowText, /if: inputs\.confirm == 'DO_NOT_DEPLOY'/);
  assert.match(workflowText, /if: inputs\.confirm == 'OPS_STUDIO_WORKER_RECOVER'/);
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
  assert.doesNotMatch(combinedCode, /\|\| true/);

  const confirm = workflow.on.workflow_dispatch.inputs.confirm;
  assert.equal(confirm.required, true);
  assert.equal(confirm.type, "choice");
  assert.ok(confirm.options.includes("DEPLOY"), "confirm options must include DEPLOY");
  assert.ok(confirm.options.includes("DO_NOT_DEPLOY"), "confirm options must include DO_NOT_DEPLOY");
  assert.ok(
    confirm.options.includes("OPS_STUDIO_WORKER_RECOVER"),
    "confirm options must include OPS_STUDIO_WORKER_RECOVER",
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

  assertStudioRenderWorkerEnvDiagnostic(workflowText, docsText);
  assertRemoteDiagnoseScriptSyntax(workflowText);
  assertStudioDiagnoseHelper();
  assertStudioRenderWorkerRecover(workflowText, docsText);
  assertRemoteRecoverScriptSyntax(workflowText);
  assertStudioRecoverHelper();

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
    "ENV FILE OWNER/GROUP/MODE =",
    "DEPLOY CAN READ ENV =",
    "ACTIVE RENDER JOBS BEFORE=",
    "WORKER CLEAN START =",
    "ENV BOOTSTRAP =",
    "WORKER RESTARTS=",
    "SURVIVED >2.5 MIN =",
    "RENDER SMOKE =",
    "#353 PRODUCTION ACCEPTANCE =",
    "CUTOVER = ${CUTOVER}",
    "audiolad_deploy = ${AUDIOLAD_DEPLOY}",
    "CUTOVER=NO",
    "audiolad_deploy=NOT_INVOKED",
    "SKIPPED_NO_SAFE_HOOK",
    "pm2 delete",
    "unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY",
    "deploy/studio-render-worker.ecosystem.config.cjs",
    "studio_render_env_ready",
    "hasNextPublicSupabaseUrl",
    "hasSupabaseServiceRoleKey",
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
  const deployStart = workflowText.indexOf("name: Deploy to production");
  assert.ok(recoverStart >= 0 && deployStart > recoverStart, "recover job must precede deploy job");
  const recoverJob = workflowText.slice(recoverStart, deployStart);
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
}

function assertRemoteRecoverScriptSyntax(workflowText) {
  const remote = extractRemoteRecoverScript(workflowText);
  const scriptPath = join(tmpdir(), `audiolad-recover-remote-${process.pid}.sh`);
  writeFileSync(scriptPath, remote);
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  rmSync(scriptPath, { force: true });
  assert.equal(syntax.status, 0, `remote recover bash -n failed: ${syntax.stderr}`);
}

function writeRecoverFixture(root, { jobCount = "0", envMode = 0o640, secretUrl, secretKey }) {
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
      "",
    ].join("\n"),
  );
  writeFileSync(errLog, "");
  writeFileSync(
    join(root, "pm2-jlist.json"),
    JSON.stringify([
      {
        name: "audiolad-studio-render-worker",
        pm2_env: {
          status: "online",
          restart_time: 0,
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
  assert.match(helperText, /SKIPPED_NO_SAFE_HOOK/);
  assert.match(helperText, /unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(helperText, /\/usr\/local\/sbin\/audiolad-deploy/);
  assert.doesNotMatch(helperText, /sudo\s+-n/);
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
    assert.match(output, /ACTIVE RENDER JOBS BEFORE=0/);
    assert.match(output, /WORKER CLEAN START = YES/);
    assert.match(output, /ENV BOOTSTRAP = YES/);
    assert.match(output, /SURVIVED >2\.5 MIN = YES/);
    assert.match(output, /RENDER SMOKE = SKIPPED_NO_SAFE_HOOK/);
    assert.match(output, /#353 PRODUCTION ACCEPTANCE = SUCCESS/);
    assert.match(output, /CUTOVER = NO/);
    assert.match(output, /audiolad_deploy = NOT_INVOKED/);
    assert.match(output, /studio_render_env_ready/);
    assert.doesNotMatch(output, new RegExp(secretKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, new RegExp(secretUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(existsSyncSafe(fixture.deletedMarker), "pm2 delete should run when worker exists");
    assert.ok(existsSyncSafe(fixture.startedMarker), "pm2 start should run");
    assert.ok(existsSyncSafe(fixture.savedMarker), "pm2 save should run after success");
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

function existsSyncSafe(path) {
  return existsSync(path);
}

main();
