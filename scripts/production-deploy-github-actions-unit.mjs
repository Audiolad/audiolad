#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = join(repoRoot, ".github/workflows/production-deploy.yml");
const wrapperPath = join(repoRoot, "deploy/scripts/github-actions-deploy-wrapper.sh");
const docsPath = join(repoRoot, "docs/production-deploy-github-actions.md");
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
  assert.ok(jobs.deploy, "job deploy must exist");
  assert.equal(jobs.deploy.environment, "production");
  assert.equal(jobs.deploy["runs-on"], "ubuntu-latest");

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

  console.log("production-deploy-github-actions-unit: all tests passed");
}

main();
