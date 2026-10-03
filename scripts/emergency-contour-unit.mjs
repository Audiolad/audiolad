import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const emergencyDir = join(repoRoot, "deploy/emergency");
const nodeMajor = process.versions.node.split(".")[0];
const tempRoots = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "audiolad-emergency-"));
  tempRoots.push(dir);
  return dir;
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...options.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      if (status !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed ${status}\n${stderr}\n${stdout}`));
        return;
      }
      resolve({ stdout, stderr, status });
    });
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    timeout: options.timeout ?? 30000,
  });
  const secret = options.redact ?? "";
  const scrub = (text) => (secret ? text.replaceAll(secret, "<redacted>") : text);
  if (options.expect === undefined) {
    assert.equal(
      result.status,
      0,
      `${command} ${args.join(" ")} failed\n${scrub(result.stderr)}\n${scrub(result.stdout)}`,
    );
  } else if (result.status !== options.expect) {
    assert.equal(
      result.status,
      options.expect,
      `${command} ${args.join(" ")} status ${result.status}\n${scrub(result.stderr)}\n${scrub(result.stdout)}`,
    );
  }
  return { ...result, stdout: scrub(result.stdout), stderr: scrub(result.stderr) };
}

function git(cwd, args) {
  return run("git", args, { cwd });
}

function writeExecutable(path, contents) {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

function initRepo(dir) {
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "emergency@example.test"]);
  git(dir, ["config", "user.name", "Emergency Test"]);
}

function commitFile(dir, name, contents, message) {
  writeFileSync(join(dir, name), contents);
  git(dir, ["add", name]);
  git(dir, ["commit", "-qm", message]);
  return git(dir, ["rev-parse", "HEAD"]).stdout.trim();
}

function copyCanonicalScripts(dir) {
  for (const relative of [
    "deploy/scripts/deploy.sh",
    "deploy/scripts/run-from-target-sha.sh",
    "deploy/scripts/github-actions-deploy-wrapper.sh",
    "deploy/scripts/lib/canonical-deploy-policy.sh",
  ]) {
    const destination = join(dir, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(repoRoot, relative), destination);
  }
}

function makePolicyRepo() {
  const dir = tempDir();
  initRepo(dir);
  copyCanonicalScripts(dir);
  git(dir, ["add", "deploy"]);
  const parent = commitFile(dir, "README", "parent\n", "parent");
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { name: "fixture" },
      "node_modules/fixture-pkg": {
        version: "1.0.0",
        resolved: "http://127.0.0.1/fixture.tgz",
        integrity: "sha512-unused",
      },
    },
  };
  writeFileSync(join(dir, "package.json"), '{"name":"fixture","private":true}\n');
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock));
  git(dir, ["add", "package.json", "package-lock.json"]);
  git(dir, ["commit", "-qm", "main"]);
  const mainSha = git(dir, ["rev-parse", "HEAD"]).stdout.trim();
  const bare = tempDir();
  run("git", ["init", "--bare", "-q", bare]);
  git(dir, ["remote", "add", "origin", bare]);
  git(dir, ["push", "-q", "origin", "main"]);
  git(dir, ["checkout", "-q", "-b", "side"]);
  const sideSha = commitFile(dir, "side.txt", "side\n", "side");
  git(dir, ["checkout", "-q", "main"]);
  return { dir, parent, mainSha, sideSha };
}

function npmFlags(deployRoot) {
  const script = join(repoRoot, "deploy/scripts/lib/npm-ci-flags.sh");
  const probe = `
set -euo pipefail
source "${script}"
log_error() { printf '%s\n' "$*" >&2; }
DEPLOY_ROOT="${deployRoot}"
if read_npm_ci_argv; then
  printf '%s\n' "\${NPM_CI_ARGV[*]}"
else
  exit 9
fi
`;
  return run("bash", ["-c", probe]);
}

function testStaticContracts() {
  const deploy = readFileSync(join(emergencyDir, "emergency-deploy.sh"), "utf8");
  const rollback = readFileSync(join(emergencyDir, "emergency-rollback.sh"), "utf8");
  const workflow = readFileSync(join(repoRoot, ".github/workflows/production-deploy.yml"), "utf8");
  const ready = readFileSync(join(emergencyDir, "emergency-build-ready.mjs"), "utf8");
  assert.match(deploy, /\/usr\/local\/sbin\/audiolad-deploy/);
  assert.match(deploy, /run_deploy_policy_gate/);
  assert.doesNotMatch(deploy, /bash -c|eval |npm ci/);
  assert.doesNotMatch(rollback, /bash -c|eval /);
  assert.match(workflow, /sudo -n \/usr\/local\/sbin\/audiolad-deploy/);
  assert.doesNotMatch(workflow, /deploy\/emergency/);
  assert.doesNotMatch(ready, /fetch\(/);
  run("bash", [join(emergencyDir, "repository-checks.sh")]);

  const manifest = JSON.parse(readFileSync(join(emergencyDir, "repos.manifest.json"), "utf8"));
  assert.deepEqual(
    manifest.repos.map((repo) => repo.github),
    ["Audiolad/audiolad", "Audiolad/music-analyzer"],
  );
  assert.equal(manifest.repos[0].required, true);
  assert.equal(manifest.repos[1].required, false);
}

function testNpmCiFlags() {
  const root = tempDir();
  mkdirSync(join(root, "shared"), { recursive: true });
  const absent = npmFlags(root);
  assert.equal(absent.stdout.trim(), "npm ci");

  const cache = join(root, "cache");
  mkdirSync(cache);
  writeFileSync(
    join(root, "shared/npm-ci-offline.env"),
    "NPM_CI_OFFLINE=1\nNPM_CI_CACHE=" + cache + "\n",
  );
  const enabled = npmFlags(root);
  assert.equal(enabled.stdout.trim(), `npm ci --offline --cache ${cache}`);

  writeFileSync(join(root, "shared/npm-ci-offline.env"), "NPM_CI_FORCE=1\n");
  const rejected = run("bash", ["-c", `
    source "${join(repoRoot, "deploy/scripts/lib/npm-ci-flags.sh")}"
    log_error() { printf '%s\\n' "$*" >&2; }
    DEPLOY_ROOT="${root}"
    read_npm_ci_argv
  `], { expect: 1 });
  assert.match(rejected.stderr, /not allowed/);
}

function testFilesystemMirror() {
  const source = tempDir();
  initRepo(source);
  commitFile(source, "a.txt", "a\n", "c1");
  git(source, ["checkout", "-q", "-b", "feature"]);
  commitFile(source, "b.txt", "b\n", "c2");
  git(source, ["checkout", "-q", "main"]);
  git(source, ["tag", "-a", "v1", "-m", "tag"]);
  const base = tempDir();
  const work = tempDir();
  const syncArgs = [
    join(emergencyDir, "mirror-sync.sh"),
    "--manifest",
    join(emergencyDir, "repos.manifest.json"),
    "--work-dir",
    work,
    "--target-base",
    base,
    "--repo",
    "audiolad",
    "--source-url",
    source,
  ];
  run("bash", syncArgs);
  const target = join(base, "audiolad/audiolad.git");
  run("bash", [
    join(emergencyDir, "mirror-validate.sh"),
    "--source",
    source,
    "--target",
    target,
  ]);
  const report = readFileSync(join(work, "sync-report.txt"), "utf8");
  assert.match(report, /^audiolad mirrored [0-9a-f]{40}$/m);

  commitFile(source, "c.txt", "c\n", "c3");
  git(source, ["branch", "-D", "feature"]);
  run("bash", syncArgs);
  run("bash", [
    join(emergencyDir, "mirror-validate.sh"),
    "--source",
    source,
    "--target",
    target,
  ]);
  const refs = run("git", ["--git-dir", target, "for-each-ref", "--format=%(refname)", "refs/heads"]).stdout;
  assert.doesNotMatch(refs, /feature/);
  assert.match(refs, /refs\/heads\/main/);
}

function testPromoteKeepsEmergencyCommit() {
  const source = tempDir();
  initRepo(source);
  commitFile(source, "a.txt", "a\n", "c1");
  const base = tempDir();
  const work = tempDir();
  const syncArgs = [
    join(emergencyDir, "mirror-sync.sh"),
    "--manifest",
    join(emergencyDir, "repos.manifest.json"),
    "--work-dir",
    work,
    "--target-base",
    base,
    "--repo",
    "audiolad",
    "--source-url",
    source,
  ];
  run("bash", syncArgs);
  run("bash", [
    join(emergencyDir, "promote-mirror.sh"),
    "--work-dir",
    work,
    "--repo",
    "audiolad",
    "--operator",
    "sergey",
    "--confirm",
    "PROMOTE_MIRROR",
  ]);
  const checkout = tempDir();
  const target = join(base, "audiolad/audiolad.git");
  run("git", ["clone", "-q", target, checkout]);
  git(checkout, ["config", "user.email", "emergency@example.test"]);
  git(checkout, ["config", "user.name", "Emergency Test"]);
  const emergencySha = commitFile(checkout, "emergency.txt", "keep\n", "emergency");
  git(checkout, ["push", "-q", "origin", "main"]);
  run("bash", syncArgs);
  const after = run("git", ["--git-dir", target, "rev-parse", "refs/heads/main"]).stdout.trim();
  assert.equal(after, emergencySha);
  assert.match(readFileSync(join(work, "sync-report.txt"), "utf8"), /skipped_promoted_to_primary/);
}

function testResyncAndRetarget() {
  const github = tempDir();
  run("git", ["init", "--bare", "-q", "-b", "main", github]);
  const emergency = tempDir();
  initRepo(emergency);
  const baseSha = commitFile(emergency, "a.txt", "a\n", "base");
  git(emergency, ["remote", "add", "origin", github]);
  git(emergency, ["push", "-q", "origin", "main"]);
  const emergencySha = commitFile(emergency, "b.txt", "b\n", "emergency");
  const plan = run("bash", [
    join(emergencyDir, "resync-to-github.sh"),
    "--emergency-repo",
    emergency,
    "--github-repo",
    github,
    "--operator",
    "sergey",
    "--confirm",
    "RESYNC_TO_GITHUB",
  ]);
  assert.match(plan.stdout, /fast_forward/);
  assert.equal(run("git", ["--git-dir", github, "rev-parse", "refs/heads/main"]).stdout.trim(), baseSha);
  run("bash", [
    join(emergencyDir, "resync-to-github.sh"),
    "--emergency-repo",
    emergency,
    "--github-repo",
    github,
    "--operator",
    "sergey",
    "--confirm",
    "RESYNC_TO_GITHUB",
    "--apply",
  ]);
  assert.equal(
    run("git", ["--git-dir", github, "rev-parse", "refs/heads/main"]).stdout.trim(),
    emergencySha,
  );

  const other = tempDir();
  run("git", ["clone", "-q", github, other]);
  git(other, ["config", "user.email", "emergency@example.test"]);
  git(other, ["config", "user.name", "Emergency Test"]);
  commitFile(other, "c.txt", "c\n", "github-only");
  git(other, ["push", "-q", "origin", "main"]);
  const diverged = run("bash", [
    join(emergencyDir, "resync-to-github.sh"),
    "--emergency-repo",
    emergency,
    "--github-repo",
    github,
    "--operator",
    "sergey",
    "--confirm",
    "RESYNC_TO_GITHUB",
    "--apply",
  ], { expect: 1 });
  assert.match(diverged.stderr, /diverged|ahead/);

  const workdir = tempDir();
  initRepo(workdir);
  commitFile(workdir, "a.txt", "a\n", "c1");
  const mirror = tempDir();
  run("git", ["init", "--bare", "-q", "-b", "main", mirror]);
  git(workdir, ["remote", "add", "origin", "https://github.com/Audiolad/audiolad.git"]);
  git(workdir, ["push", "-q", mirror, "main"]);
  const refused = run("bash", [
    join(emergencyDir, "retarget-origin.sh"),
    "--git-workdir",
    workdir,
    "--origin-url",
    "https://github.com/Audiolad/audiolad.git",
    "--operator",
    "sergey",
    "--confirm",
    "RETARGET_ORIGIN_TO_EMERGENCY",
  ], { expect: 1 });
  assert.match(refused.stderr, /GitHub/);
  run("bash", [
    join(emergencyDir, "retarget-origin.sh"),
    "--git-workdir",
    workdir,
    "--origin-url",
    mirror,
    "--operator",
    "sergey",
    "--confirm",
    "RETARGET_ORIGIN_TO_EMERGENCY",
    "--apply",
  ]);
  assert.equal(git(workdir, ["remote", "get-url", "origin"]).stdout.trim(), mirror);

  const retarget = readFileSync(join(emergencyDir, "retarget-origin.sh"), "utf8");
  assert.match(retarget, /\/var\/www\/audiolad-clean/);
  assert.match(retarget, /AUDIOLAD_EMERGENCY_ALLOW_PRODUCTION_PATH/);
}

function testDeployPolicy() {
  const { dir, parent, mainSha, sideSha } = makePolicyRepo();
  const audit = join(tempDir(), "audit.log");
  const cache = join(tempDir(), "cache");
  const body = Buffer.from("fixture-tarball");
  const integrity = `sha512-${createHash("sha512").update(body).digest("base64")}`;
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { name: "fixture" },
      "node_modules/fixture-pkg": {
        version: "1.0.0",
        resolved: "http://127.0.0.1/fixture.tgz",
        integrity,
      },
    },
  };
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock));
  git(dir, ["add", "package-lock.json"]);
  git(dir, ["commit", "-qm", "lock"]);
  const readySha = git(dir, ["rev-parse", "HEAD"]).stdout.trim();
  git(dir, ["push", "-q", "origin", "main"]);
  mkdirSync(join(cache, "tarballs"), { recursive: true });
  const safe = integrity.replace(/[^A-Za-z0-9.-]/g, "_");
  writeFileSync(join(cache, "tarballs", safe), body);

  const common = [
    "--operator",
    "sergey",
    "--confirm",
    "EMERGENCY_DEPLOY",
    "--git-workdir",
    dir,
    "--audit-log",
    audit,
  ];
  const side = run("bash", [
    join(emergencyDir, "emergency-deploy.sh"),
    "--sha",
    sideSha,
    "--production-commit",
    parent,
    ...common,
    "--plan",
  ], { expect: 1 });
  assert.match(side.stderr, /rejected|not reachable|not an ancestor|canonical deploy policy/i);

  const rewind = run("bash", [
    join(emergencyDir, "emergency-deploy.sh"),
    "--sha",
    parent,
    "--production-commit",
    mainSha,
    ...common,
    "--plan",
  ], { expect: 1 });
  assert.match(rewind.stderr, /ancestry|canonical deploy policy/i);

  const record = join(tempDir(), "record.txt");
  const planned = run("bash", [
    join(emergencyDir, "ci-runner.sh"),
    "--sha",
    readySha,
    "--operator",
    "sergey",
    "--confirm",
    "EMERGENCY_CI",
    "--git-workdir",
    dir,
    "--production-commit",
    mainSha,
    "--audit-log",
    audit,
    "--cache",
    cache,
    "--execute",
  ], {
    env: {
      AUDIOLAD_EMERGENCY_EXECUTOR: "record",
      AUDIOLAD_EMERGENCY_RECORD_FILE: record,
      AUDIOLAD_EMERGENCY_EXPECT_NODE_MAJOR: nodeMajor,
    },
  });
  assert.match(planned.stdout, /canonical_command=sudo -n \/usr\/local\/sbin\/audiolad-deploy/);
  assert.equal(readFileSync(record, "utf8").trim(), `sudo -n /usr/local/sbin/audiolad-deploy ${readySha}`);
  assert.match(readFileSync(audit, "utf8"), /result=invoked_canonical_audiolad_deploy/);

  const sshRecord = join(tempDir(), "ssh.txt");
  const bin = tempDir();
  writeExecutable(join(bin, "ssh"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${sshRecord}"\n`);
  const key = join(tempDir(), "id");
  const hosts = join(tempDir(), "known_hosts");
  writeFileSync(key, "not-a-real-key\n");
  writeFileSync(hosts, "example.test ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFake\n");
  run("bash", [
    join(emergencyDir, "emergency-deploy.sh"),
    "--sha",
    readySha,
    "--production-commit",
    mainSha,
    ...common,
    "--cache",
    cache,
    "--execute",
  ], {
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      AUDIOLAD_EMERGENCY_EXECUTOR: "ssh",
      AUDIOLAD_EMERGENCY_SSH_USER: "deploy",
      AUDIOLAD_EMERGENCY_SSH_HOST: "example.test",
      AUDIOLAD_EMERGENCY_SSH_PORT: "22",
      AUDIOLAD_EMERGENCY_SSH_KEY: key,
      AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS: hosts,
      AUDIOLAD_EMERGENCY_EXPECT_NODE_MAJOR: nodeMajor,
    },
  });
  const sshArgs = readFileSync(sshRecord, "utf8");
  assert.match(sshArgs, /deploy@example\.test/);
  assert.match(sshArgs, /sudo\n-n\n\/usr\/local\/sbin\/audiolad-deploy\n/);
  assert.match(sshArgs, new RegExp(readySha));
  assert.doesNotMatch(sshArgs, /bash/);

  const rollbackRecord = join(tempDir(), "rollback.txt");
  run("bash", [
    join(emergencyDir, "emergency-rollback.sh"),
    "--operator",
    "sergey",
    "--confirm",
    "EMERGENCY_ROLLBACK",
    "--reason",
    "health check failed",
    "--previous-commit",
    mainSha,
    "--audit-log",
    audit,
    "--execute",
  ], {
    env: {
      AUDIOLAD_EMERGENCY_EXECUTOR: "record",
      AUDIOLAD_EMERGENCY_RECORD_FILE: rollbackRecord,
    },
  });
  assert.match(readFileSync(rollbackRecord, "utf8"), /\/var\/www\/audiolad-deploy\/scripts\/rollback\.sh health check failed/);

  const badConfirm = run("bash", [
    join(emergencyDir, "emergency-deploy.sh"),
    "--sha",
    readySha,
    "--operator",
    "sergey",
    "--confirm",
    "DEPLOY",
    "--git-workdir",
    dir,
    "--production-commit",
    mainSha,
    "--audit-log",
    audit,
    "--plan",
  ], { expect: 1 });
  assert.match(badConfirm.stderr, /EMERGENCY_DEPLOY/);
}

async function testBuildReadyAndSeed() {
  const notReady = run("node", [
    join(emergencyDir, "emergency-build-ready.mjs"),
    "--git-workdir",
    repoRoot,
    "--sha",
    run("git", ["rev-parse", "HEAD"]).stdout.trim(),
    "--cache",
    tempDir(),
    "--expected-node-major",
    "99",
  ], { expect: 1 });
  assert.match(notReady.stdout, /"emergency_build_ready":false/);
  assert.match(notReady.stderr, /networkAccess|emergency_build_ready=no/);

  const body = Buffer.from("offline-tarball");
  const integrity = `sha512-${createHash("sha512").update(body).digest("base64")}`;
  const server = http.createServer((request, response) => {
    if (request.url === "/pkg.tgz") {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(body);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const port = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
  try {
    const dir = tempDir();
    const lockPath = join(dir, "package-lock.json");
    writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture" },
          "node_modules/fixture-pkg": {
            version: "1.0.0",
            resolved: `http://127.0.0.1:${port}/pkg.tgz`,
            integrity,
          },
        },
      }),
    );
    const cache = tempDir();
    const seeded = await runAsync("node", [
      join(emergencyDir, "seed-npm-cache.mjs"),
      "--lockfile",
      lockPath,
      "--cache",
      cache,
    ]);
    assert.match(seeded.stdout, /seeded=1/);
    initRepo(dir);
    writeFileSync(join(dir, "package.json"), '{"name":"fixture"}\n');
    git(dir, ["add", "package.json", "package-lock.json"]);
    git(dir, ["commit", "-qm", "lock"]);
    const sha = git(dir, ["rev-parse", "HEAD"]).stdout.trim();
    const ready = run("node", [
      join(emergencyDir, "emergency-build-ready.mjs"),
      "--git-workdir",
      dir,
      "--sha",
      sha,
      "--cache",
      cache,
      "--expected-node-major",
      nodeMajor,
    ]);
    assert.match(ready.stdout, /"emergency_build_ready":true/);
    assert.match(ready.stdout, /"networkAccess":"none"/);
  } finally {
    server.close();
  }
}

function testInventory() {
  const inventoryPath = join(emergencyDir, "build-dependency-inventory.json");
  const before = readFileSync(inventoryPath, "utf8");
  run("node", [join(emergencyDir, "inventory-build-deps.mjs")]);
  const after = readFileSync(inventoryPath, "utf8");
  assert.equal(after, before);
  const inventory = JSON.parse(after);
  assert.equal(inventory.expectedNodeMajor, 22);
  assert.equal(inventory.hosts["registry.npmjs.org"], inventory.packageCount);
  assert.ok(inventory.packageCount > 100);
  const lockHash = createHash("sha256").update(readFileSync(join(repoRoot, "package-lock.json"))).digest("hex");
  assert.equal(inventory.lockfileSha256, lockHash);
}

function testSkipUnreachableOptionalRepo() {
  const work = tempDir();
  const base = tempDir();
  const result = run("bash", [
    join(emergencyDir, "mirror-sync.sh"),
    "--manifest",
    join(emergencyDir, "repos.manifest.json"),
    "--work-dir",
    work,
    "--target-base",
    base,
    "--repo",
    "music-analyzer",
    "--source-url",
    join(tempDir(), "missing.git"),
  ]);
  assert.match(result.stdout, /skipped_source_unreachable/);
  const refused = run("bash", [
    join(emergencyDir, "mirror-sync.sh"),
    "--manifest",
    join(emergencyDir, "repos.manifest.json"),
    "--work-dir",
    work,
    "--target-base",
    "https://github.com/Audiolad/audiolad.git",
    "--repo",
    "audiolad",
    "--dry-run",
  ], { expect: 1 });
  assert.match(refused.stderr, /GitHub/);
}

function testSshInvocationDoesNotEmbedToken() {
  const source = tempDir();
  initRepo(source);
  commitFile(source, "a.txt", "a\n", "c1");
  const work = tempDir();
  const bin = tempDir();
  const record = join(tempDir(), "ssh.txt");
  writeExecutable(join(bin, "ssh"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${record}"\nexit 1\n`);
  const key = join(tempDir(), "id");
  const hosts = join(tempDir(), "known_hosts");
  writeFileSync(key, "not-a-real-key\n");
  writeFileSync(hosts, "git.example.test ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFake\n");
  const failed = run("bash", [
    join(emergencyDir, "mirror-sync.sh"),
    "--manifest",
    join(emergencyDir, "repos.manifest.json"),
    "--work-dir",
    work,
    "--target-base",
    "ssh://git@git.example.test/git",
    "--repo",
    "audiolad",
    "--source-url",
    source,
  ], {
    expect: 1,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      AUDIOLAD_EMERGENCY_SSH_KEY: key,
      AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS: hosts,
      AUDIOLAD_EMERGENCY_GIT_TOKEN: "super-secret-token",
    },
    redact: "super-secret-token",
  });
  assert.doesNotMatch(failed.stderr + failed.stdout, /super-secret-token/);
  const sshArgs = readFileSync(record, "utf8");
  assert.match(sshArgs, /git-receive-pack|git-upload-pack|git\.example\.test/);
  assert.doesNotMatch(sshArgs, /super-secret-token/);
}

async function testGitea() {
  const binary = process.env.AUDIOLAD_GITEA_BIN;
  if (!binary || !existsSync(binary)) {
    process.stdout.write("gitea_integration=skipped\n");
    return;
  }
  const root = tempDir();
  const port = 23000 + Math.floor(Math.random() * 10000);
  mkdirSync(join(root, "custom/conf"), { recursive: true });
  mkdirSync(join(root, "data"), { recursive: true });
  const config = readFileSync(join(emergencyDir, "gitea/app.ini.example"), "utf8")
    .replaceAll("__WORK_PATH__", root)
    .replaceAll("__HTTP_PORT__", String(port))
    .replace("DISABLE_SSH = false", "DISABLE_SSH = true")
    .replace("START_SSH_SERVER = true", "START_SSH_SERVER = false")
    .replace("SECRET_KEY = replace-with-a-random-secret", "SECRET_KEY = 0123456789abcdef0123456789abcdef")
    .replace(
      "INTERNAL_TOKEN = replace-with-a-random-internal-token",
      "INTERNAL_TOKEN = 0123456789abcdef0123456789abcdef0123456789abcdef",
    )
    .replace("JWT_SECRET = replace-with-a-random-jwt-secret", "JWT_SECRET = 0123456789abcdef0123456789abcdef");
  writeFileSync(join(root, "custom/conf/app.ini"), config);
  const giteaArgs = ["--work-path", root, "--config", join(root, "custom/conf/app.ini")];
  run(binary, ["migrate", ...giteaArgs], { timeout: 20000 });
  run(binary, [
    "admin",
    "user",
    "create",
    ...giteaArgs,
    "--username",
    "audiolad",
    "--password",
    "local-test-password",
    "--email",
    "audiolad@example.test",
    "--admin",
    "--must-change-password=false",
  ]);
  const tokenResult = run(binary, [
    "admin",
    "user",
    "generate-access-token",
    ...giteaArgs,
    "--username",
    "audiolad",
    "--token-name",
    "mirror",
    "--scopes",
    "all",
    "--raw",
  ]);
  const token = tokenResult.stdout.trim();
  assert.equal(token.length, 40);
  const web = spawn(binary, ["web", ...giteaArgs], {
    detached: true,
    stdio: "ignore",
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    assert.equal(ready, true);
    const created = await fetch(`http://127.0.0.1:${port}/api/v1/user/repos`, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "audiolad", private: true, auto_init: false }),
    });
    assert.equal(created.status, 201);
    const source = tempDir();
    initRepo(source);
    commitFile(source, "a.txt", "a\n", "c1");
    git(source, ["checkout", "-q", "-b", "feature"]);
    commitFile(source, "b.txt", "b\n", "c2");
    git(source, ["checkout", "-q", "main"]);
    git(source, ["tag", "-a", "v1", "-m", "tag"]);
    const work = tempDir();
    run("bash", [
      join(emergencyDir, "mirror-sync.sh"),
      "--manifest",
      join(emergencyDir, "repos.manifest.json"),
      "--work-dir",
      work,
      "--target-base",
      `http://127.0.0.1:${port}`,
      "--repo",
      "audiolad",
      "--source-url",
      source,
    ], {
      env: {
        AUDIOLAD_EMERGENCY_GIT_USERNAME: "audiolad",
        AUDIOLAD_EMERGENCY_GIT_TOKEN: token,
      },
      redact: token,
    });
    const remoteRefs = run("git", [
      "-c",
      `http.extraHeader=Authorization: Basic ${Buffer.from(`audiolad:${token}`).toString("base64")}`,
      "ls-remote",
      `http://127.0.0.1:${port}/audiolad/audiolad.git`,
    ], { redact: token }).stdout;
    assert.match(remoteRefs, /refs\/heads\/feature/, remoteRefs);
    const checkout = tempDir();
    run("git", [
      "-c",
      `http.extraHeader=Authorization: Basic ${Buffer.from(`audiolad:${token}`).toString("base64")}`,
      "clone",
      "--bare",
      "-q",
      `http://127.0.0.1:${port}/audiolad/audiolad.git`,
      checkout,
    ], { redact: token });
    run("bash", [
      join(emergencyDir, "mirror-validate.sh"),
      "--source",
      source,
      "--target",
      checkout,
    ]);
    run("bash", [
      join(emergencyDir, "promote-mirror.sh"),
      "--work-dir",
      work,
      "--repo",
      "audiolad",
      "--operator",
      "sergey",
      "--confirm",
      "PROMOTE_MIRROR",
    ], {
      env: {
        AUDIOLAD_GITEA_API_URL: `http://127.0.0.1:${port}`,
        AUDIOLAD_GITEA_OWNER: "audiolad",
        AUDIOLAD_EMERGENCY_GIT_TOKEN: token,
      },
      redact: token,
    });
    const promoteBody = JSON.parse(readFileSync(join(work, "state/audiolad.gitea-promote.json"), "utf8"));
    assert.equal(promoteBody.mirror, false);
    assert.equal(promoteBody.private, true);
    process.stdout.write("gitea_integration=passed\n");
  } finally {
    if (web.pid) {
      try {
        process.kill(-web.pid);
      } catch {
        process.kill(web.pid);
      }
    }
  }
}

function testMirrorMismatchFails() {
  const source = tempDir();
  const target = tempDir();
  initRepo(source);
  initRepo(target);
  commitFile(source, "a.txt", "a\n", "c1");
  commitFile(target, "a.txt", "b\n", "other");
  const failed = run("bash", [
    join(emergencyDir, "mirror-validate.sh"),
    "--source",
    source,
    "--target",
    target,
  ], { expect: 1 });
  assert.match(failed.stderr, /differ|missing commits/);
}

try {
  testStaticContracts();
  testNpmCiFlags();
  testFilesystemMirror();
  testPromoteKeepsEmergencyCommit();
  testResyncAndRetarget();
  testDeployPolicy();
  await testBuildReadyAndSeed();
  testInventory();
  testSkipUnreachableOptionalRepo();
  testSshInvocationDoesNotEmbedToken();
  testMirrorMismatchFails();
  await testGitea();
  process.stdout.write("emergency_contour_unit=ok\n");
} finally {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
}
