#!/usr/bin/env node
// Emergency contour checks: mirror, promotion, ancestry, canonical command, offline build.

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const emergency = join(repoRoot, "deploy/emergency");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, { env = {}, cwd = repoRoot, allowFail = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" },
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (!allowFail && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${output}`);
  }
  return { status: result.status ?? 1, output };
}

function git(dir, args) {
  return run("git", ["-C", dir, ...args]);
}

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@audiolad.local"]);
  git(dir, ["config", "user.name", "Emergency Test"]);
}

function commitAll(dir, message) {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]).output.trim();
}

function writeExecutable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

const reposList = readFileSync(join(emergency, "repos.list"), "utf8");
assert(reposList.includes("Audiolad/audiolad|Audiolad|audiolad|yes"), "audiolad mirror line missing");
assert(!/^[^#\n]*music-analyzer/m.test(reposList), "music-analyzer must not be enabled without access");
assert(reposList.includes("Could not resolve to a Repository"), "music-analyzer absence must be recorded");

const deploySh = readFileSync(join(repoRoot, "deploy/scripts/deploy.sh"), "utf8");
const launcher = readFileSync(join(repoRoot, "deploy/scripts/run-from-target-sha.sh"), "utf8");
const wrapper = readFileSync(join(repoRoot, "deploy/scripts/github-actions-deploy-wrapper.sh"), "utf8");
assert(deploySh.includes("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1"), "canonical deploy must skip Playwright CDN");
assert(deploySh.includes("npm ci"), "canonical deploy must keep npm ci");
assert(wrapper.includes("unset AUDIOLAD_DEPLOY_OVERRIDE"), "wrapper must keep override unset");
assert(!readFileSync(join(emergency, "ci/emergency-deploy.sh"), "utf8").includes("bash -s"), "emergency deploy must not pipe a shell");

const root = mkdtempSync(join(tmpdir(), "audiolad-emergency-unit-"));
try {
  const sourceWork = join(root, "source-work");
  const github = join(root, "github/Audiolad/audiolad.git");
  const mirror = join(root, "mirror/Audiolad/audiolad.git");
  initRepo(sourceWork);
  writeFileSync(join(sourceWork, "README.md"), "base\n");
  commitAll(sourceWork, "base");
  writeFileSync(join(sourceWork, "README.md"), "second\n");
  commitAll(sourceWork, "second");
  git(sourceWork, ["branch", "feature"]);
  git(sourceWork, ["tag", "-a", "v1", "-m", "v1"]);
  git(sourceWork, ["clone", "--bare", "-q", sourceWork, github]);

  const list = join(root, "repos.list");
  writeFileSync(list, "Audiolad/audiolad|Audiolad|audiolad|yes\n");
  const state = join(root, "state");
  const cache = join(root, "cache");
  const mirrorEnv = {
    EMERGENCY_MIRROR_ROOT: cache,
    EMERGENCY_STATE_DIR: state,
    EMERGENCY_MIRROR_BASE: `file://${join(root, "mirror")}`,
    EMERGENCY_GITHUB_BASE: `file://${join(root, "github")}`,
    EMERGENCY_REPO_LIST: list,
    EMERGENCY_MIRROR_BACKEND: "git",
    ALLOW_FILE_MIRROR: "1",
    GITEA_TOKEN: "super-secret-token-value",
    GITEA_USERNAME: "audiolad-admin",
    EMERGENCY_ACTOR: "unit-test",
  };
  const sync = run("bash", [join(emergency, "mirror/sync-from-github.sh"), "--verify-history"], { env: mirrorEnv });
  assert(!sync.output.includes("super-secret-token-value"), "sync leaked the token");
  assert(sync.output.includes("history_ok"), sync.output);
  const githubHeads = git(github, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/tags"]).output.trim().split("\n").sort();
  const mirrorHeads = git(mirror, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/tags"]).output.trim().split("\n").sort();
  assert(githubHeads.join() === mirrorHeads.join(), `refs diverged ${githubHeads} vs ${mirrorHeads}`);
  assert(githubHeads.includes("refs/heads/feature"), "feature branch was not mirrored");
  assert(githubHeads.includes("refs/tags/v1"), "tag was not mirrored");

  git(sourceWork, ["branch", "-D", "feature"]);
  git(github, ["push", ".", ":refs/heads/feature"]);
  // The github bare remote still has feature until we delete it there.
  git(github, ["update-ref", "-d", "refs/heads/feature"]);
  run("bash", [join(emergency, "mirror/sync-from-github.sh")], { env: mirrorEnv });
  const afterDelete = git(mirror, ["for-each-ref", "--format=%(refname)", "refs/heads"]).output;
  assert(!afterDelete.includes("refs/heads/feature"), "deleted branch remained on the mirror");

  run("bash", [join(emergency, "mirror/promote-to-primary.sh"), "PROMOTE_MIRROR_TO_PRIMARY"], { env: mirrorEnv });
  const refused = run("bash", [join(emergency, "mirror/sync-from-github.sh")], { env: mirrorEnv, allowFail: true });
  assert(refused.status !== 0, "sync must refuse after promotion");
  assert(refused.output.includes("refusing sync"), refused.output);

  const mirrorCheckout = join(root, "mirror-checkout");
  git(mirror, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(mirror, ["clone", "-q", "-b", "main", mirror, mirrorCheckout]);
  git(mirrorCheckout, ["config", "user.email", "test@audiolad.local"]);
  git(mirrorCheckout, ["config", "user.name", "Emergency Test"]);
  writeFileSync(join(mirrorCheckout, "EMERGENCY.txt"), "kept\n");
  const emergencySha = commitAll(mirrorCheckout, "emergency only");
  git(mirrorCheckout, ["push", "-q", "origin", "HEAD:main"]);
  run("bash", [join(emergency, "mirror/resync-to-github.sh"), "RESTORE_GITHUB_PRIMARY"], { env: mirrorEnv });
  const githubMain = git(github, ["rev-parse", "refs/heads/main"]).output.trim();
  assert(githubMain === emergencySha, "fast-forward back to GitHub lost the emergency commit");

  writeFileSync(join(state, "primary"), "gitea\n");
  const divergeWork = join(root, "diverge");
  git(github, ["clone", "-q", github, divergeWork]);
  git(divergeWork, ["config", "user.email", "test@audiolad.local"]);
  git(divergeWork, ["config", "user.name", "Emergency Test"]);
  writeFileSync(join(divergeWork, "GITHUB_ONLY.txt"), "divergent\n");
  commitAll(divergeWork, "github only");
  git(divergeWork, ["push", "-q", "origin", "HEAD:main"]);
  writeFileSync(join(mirrorCheckout, "MIRROR_ONLY.txt"), "other\n");
  commitAll(mirrorCheckout, "mirror only");
  git(mirrorCheckout, ["push", "-q", "origin", "HEAD:main"]);
  const diverged = run("bash", [join(emergency, "mirror/resync-to-github.sh"), "RESTORE_GITHUB_PRIMARY"], {
    env: mirrorEnv,
    allowFail: true,
  });
  assert(diverged.status !== 0, "diverged resync must fail");
  assert(diverged.output.includes("not a fast-forward"), diverged.output);

  const badPromote = run("bash", [join(emergency, "mirror/promote-to-primary.sh"), "yes"], {
    env: mirrorEnv,
    allowFail: true,
  });
  assert(badPromote.status !== 0, "promotion without the exact token must fail");

  const gitDir = join(root, "policy.git");
  initRepo(gitDir);
  mkdirSync(join(gitDir, "deploy/scripts"), { recursive: true });
  writeFileSync(join(gitDir, "deploy/scripts/deploy.sh"), deploySh);
  writeFileSync(join(gitDir, "deploy/scripts/run-from-target-sha.sh"), launcher);
  writeFileSync(join(gitDir, "deploy/scripts/github-actions-deploy-wrapper.sh"), wrapper);
  writeFileSync(join(gitDir, "package-lock.json"), readFileSync(join(repoRoot, "package-lock.json")));
  writeFileSync(join(gitDir, "package.json"), "{\"name\":\"fixture\"}\n");
  const productionSha = commitAll(gitDir, "production");
  git(gitDir, ["branch", "-M", "main"]);
  writeFileSync(join(gitDir, "CHANGE.txt"), "candidate\n");
  const candidateSha = commitAll(gitDir, "candidate");
  git(gitDir, ["checkout", "-q", "-b", "side", productionSha]);
  writeFileSync(join(gitDir, "SIDE.txt"), "side\n");
  const sideSha = commitAll(gitDir, "side");
  git(gitDir, ["checkout", "-q", "main"]);

  const audit = join(root, "deploy-audit.log");
  const preflightEnv = {
    EMERGENCY_GIT_DIR: gitDir,
    EMERGENCY_AUDIT_LOG: audit,
    EMERGENCY_ACTOR: "unit-test",
    ACTIVE_PRODUCTION_SHA: productionSha,
  };
  const preflight = run("bash", [join(emergency, "ci/emergency-deploy.sh"), "preflight", candidateSha], { env: preflightEnv });
  assert(preflight.output.includes(`sudo -n /usr/local/sbin/audiolad-deploy ${candidateSha}`), preflight.output);
  const auditText = readFileSync(audit, "utf8");
  assert(auditText.includes("actor=unit-test"), auditText);
  assert(auditText.includes(candidateSha), auditText);

  const side = run("bash", [join(emergency, "ci/emergency-deploy.sh"), "preflight", sideSha], {
    env: preflightEnv,
    allowFail: true,
  });
  assert(side.status !== 0, "side branch must be refused");
  const behind = run("bash", [join(emergency, "ci/emergency-deploy.sh"), "preflight", productionSha], {
    env: { ...preflightEnv, ACTIVE_PRODUCTION_SHA: candidateSha },
    allowFail: true,
  });
  assert(behind.status !== 0, "candidate older than production must be refused");
  const override = run("bash", [join(emergency, "ci/emergency-deploy.sh"), "preflight", candidateSha], {
    env: { ...preflightEnv, AUDIOLAD_DEPLOY_OVERRIDE: "1" },
    allowFail: true,
  });
  assert(override.status !== 0, "override must be refused");

  const sshLog = join(root, "ssh.log");
  const fakeSsh = join(root, "fake-ssh");
  writeExecutable(fakeSsh, `#!/bin/bash
set -euo pipefail
cmd=""
seen=0
for arg in "$@"; do
  if [[ "$seen" == "1" ]]; then
    cmd+="$arg "
  fi
  if [[ "$arg" == "--" ]]; then
    seen=1
  fi
done
printf '%s\\n' "$cmd" >> "${sshLog}"
if [[ "$cmd" == *"audiolad-emergency-git-source status"* ]]; then
  printf 'origin_role=mirror\\n'
  exit 0
fi
if [[ "$cmd" == *"cat /var/www/audiolad-deploy/current/.deploy-commit"* ]]; then
  printf '%s\\n' "${candidateSha}"
  exit 0
fi
if [[ "$cmd" == *"audiolad-deploy ${candidateSha}"* ]]; then
  exit 0
fi
if [[ "$cmd" == *"audiolad-rollback"* ]]; then
  exit 0
fi
printf 'unexpected %s\\n' "$cmd" >&2
exit 1
`);
  const key = join(root, "id");
  const hosts = join(root, "known_hosts");
  writeFileSync(key, "test-key\n");
  writeFileSync(hosts, "test-host ssh-ed25519 AAAA\n");
  const execute = run("bash", [join(emergency, "ci/emergency-deploy.sh"), "execute", candidateSha], {
    env: {
      ...preflightEnv,
      AUDIOLAD_EMERGENCY_DEPLOY_EXECUTE: "1",
      EMERGENCY_SSH_BIN: fakeSsh,
      PRODUCTION_SSH_HOST: "203.0.113.10",
      PRODUCTION_SSH_PORT: "22",
      PRODUCTION_SSH_USER: "deploy",
      PRODUCTION_SSH_KEY_FILE: key,
      PRODUCTION_SSH_KNOWN_HOSTS_FILE: hosts,
    },
  });
  assert(execute.output.includes("execute_ok"), execute.output);
  const sshText = readFileSync(sshLog, "utf8");
  assert(sshText.includes(`sudo -n /usr/local/sbin/audiolad-deploy ${candidateSha}`), sshText);
  assert(!sshText.includes("bash -s"), sshText);
  const noExecute = run("bash", [join(emergency, "ci/emergency-deploy.sh"), "execute", candidateSha], {
    env: preflightEnv,
    allowFail: true,
  });
  assert(noExecute.status !== 0, "execute without the arming flag must fail");

  const rollbackLog = join(root, "rollback-ssh.log");
  const rollback = run("bash", [join(emergency, "ci/emergency-rollback.sh"), "execute"], {
    env: {
      EMERGENCY_AUDIT_LOG: join(root, "rollback-audit.log"),
      EMERGENCY_ACTOR: "unit-test",
      AUDIOLAD_EMERGENCY_ROLLBACK_EXECUTE: "1",
      EMERGENCY_SSH_BIN: fakeSsh,
      PRODUCTION_SSH_HOST: "203.0.113.10",
      PRODUCTION_SSH_PORT: "22",
      PRODUCTION_SSH_USER: "deploy",
      PRODUCTION_SSH_KEY_FILE: key,
      PRODUCTION_SSH_KNOWN_HOSTS_FILE: hosts,
    },
  });
  assert(rollback.output.includes("rollback_execute"), rollback.output);
  void rollbackLog;

  const release = join(root, "deploy-root/releases/rel");
  mkdirSync(join(release, "deploy/scripts"), { recursive: true });
  const marker = join(root, "rollback-marker");
  writeExecutable(join(release, "deploy/scripts/rollback.sh"), `#!/bin/bash
printf '%s\\n' "$@" > "${marker}"
`);
  mkdirSync(join(root, "deploy-root"), { recursive: true });
  run("ln", ["-sfn", release, join(root, "deploy-root/current")]);
  run("bash", [join(emergency, "rollback-wrapper.sh")], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", DEPLOY_ROOT: join(root, "deploy-root") },
  });
  assert(readFileSync(marker, "utf8").includes("emergency rollback via audiolad-rollback"), "wrapper did not call canonical rollback");
  const extraArg = run("bash", [join(emergency, "rollback-wrapper.sh"), "rm -rf /"], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", DEPLOY_ROOT: join(root, "deploy-root") },
    allowFail: true,
  });
  assert(extraArg.status !== 0, "rollback wrapper must reject arguments");

  const object = join(root, "objects");
  initRepo(object);
  writeFileSync(join(object, "README.md"), "objects\n");
  commitAll(object, "base");
  git(object, ["branch", "-M", "main"]);
  const mirrorRemote = join(root, "mirror-remote.git");
  git(object, ["clone", "--bare", "-q", object, mirrorRemote]);
  const prodRelease = join(root, "prod/releases/current-rel");
  mkdirSync(prodRelease, { recursive: true });
  writeFileSync(join(prodRelease, ".deploy-commit"), `${git(object, ["rev-parse", "HEAD"]).output.trim()}\n`);
  run("ln", ["-sfn", prodRelease, join(root, "prod/current")]);
  const githubRemote = join(root, "github-remote.git");
  git(object, ["clone", "--bare", "-q", object, githubRemote]);
  git(object, ["remote", "add", "origin", `file://${githubRemote}`]);
  git(object, ["fetch", "-q", "origin"]);
  const config = join(root, "emergency-git.env");
  const prodSha = readFileSync(join(prodRelease, ".deploy-commit"), "utf8").trim();
  writeFileSync(config, [
    `EMERGENCY_MIRROR_URL=file://${mirrorRemote}`,
    `GITHUB_ORIGIN_URL=file://${githubRemote}`,
    `GIT_WORKDIR=${object}`,
    `DEPLOY_ROOT=${join(root, "prod")}`,
    `AUDIT_LOG=${join(root, "git-source-audit.log")}`,
    `STATE_DIR=${join(root, "git-state")}`,
    "ALLOW_FILE_MIRROR=1",
    "ALLOW_HTTP_MIRROR=0",
    "",
  ].join("\n"));
  const status = run("bash", [join(emergency, "git-source.sh"), "status"], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", AUDIOLAD_EMERGENCY_GIT_CONFIG: config },
  });
  assert(status.output.includes("origin_role=github"), status.output);
  run("bash", [join(emergency, "git-source.sh"), "activate-mirror"], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", AUDIOLAD_EMERGENCY_GIT_CONFIG: config, EMERGENCY_ACTOR: "unit-test" },
  });
  const mirrored = run("bash", [join(emergency, "git-source.sh"), "status"], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", AUDIOLAD_EMERGENCY_GIT_CONFIG: config },
  });
  assert(mirrored.output.includes("origin_role=mirror"), mirrored.output);
  writeFileSync(join(mirrorCheckout, "nope.txt"), "ahead\n");
  // Mirror remote is bare and still at prod. Move it ahead, then restore must fail
  // until GitHub contains that commit.
  const aheadWork = join(root, "ahead-work");
  git(mirrorRemote, ["clone", "-q", mirrorRemote, aheadWork]);
  git(aheadWork, ["config", "user.email", "test@audiolad.local"]);
  git(aheadWork, ["config", "user.name", "Emergency Test"]);
  writeFileSync(join(aheadWork, "AHEAD.txt"), "ahead\n");
  commitAll(aheadWork, "ahead of github");
  git(aheadWork, ["push", "-q", "origin", "HEAD:main"]);
  git(object, ["fetch", "-q", "origin", "main"]);
  const blockedRestore = run("bash", [join(emergency, "git-source.sh"), "restore-github"], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", AUDIOLAD_EMERGENCY_GIT_CONFIG: config },
    allowFail: true,
  });
  assert(blockedRestore.status !== 0, "restore must refuse when GitHub lacks mirror commits");
  git(githubRemote, ["fetch", "-q", mirrorRemote, "main:main"]);
  run("bash", [join(emergency, "git-source.sh"), "restore-github"], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", AUDIOLAD_EMERGENCY_GIT_CONFIG: config, EMERGENCY_ACTOR: "unit-test" },
  });
  const restored = run("bash", [join(emergency, "git-source.sh"), "status"], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", AUDIOLAD_EMERGENCY_GIT_CONFIG: config },
  });
  assert(restored.output.includes("origin_role=github"), restored.output);
  assert(restored.output.includes(`production_sha=${prodSha}`), restored.output);

  writeFileSync(config, `EMERGENCY_MIRROR_URL=git@evil.example:org/repo.git;touch\nGITHUB_ORIGIN_URL=file://${githubRemote}\nGIT_WORKDIR=${object}\nDEPLOY_ROOT=${join(root, "prod")}\nALLOW_FILE_MIRROR=1\n`);
  const badUrl = run("bash", [join(emergency, "git-source.sh"), "status"], {
    env: { AUDIOLAD_EMERGENCY_TEST: "1", AUDIOLAD_EMERGENCY_GIT_CONFIG: config },
    allowFail: true,
  });
  assert(badUrl.status !== 0, "metacharacters in the mirror URL must be rejected");

  const emptyCache = join(root, "empty-npm-cache");
  mkdirSync(emptyCache);
  const curlTripwire = join(root, "tripwire");
  mkdirSync(curlTripwire);
  writeExecutable(join(curlTripwire, "curl"), "#!/bin/sh\nexit 97\n");
  writeExecutable(join(curlTripwire, "wget"), "#!/bin/sh\nexit 97\n");
  const inventory = run("bash", [
    join(emergency, "build/emergency-build-ready.sh"),
    "--inventory",
    "--git-dir", repoRoot,
    "--sha", run("git", ["-C", repoRoot, "rev-parse", "HEAD"]).output.trim(),
    "--cache", emptyCache,
  ], { env: { PATH: `${curlTripwire}:${process.env.PATH}` } });
  assert(inventory.output.includes("emergency_build_ready=inventory"), inventory.output);
  assert(inventory.output.includes("registry.npmjs.org"), inventory.output);
  assert(inventory.output.includes("playwright_skip_in_deploy_sh=no") || inventory.output.includes("playwright_skip_in_deploy_sh=yes"), inventory.output);
  const notReady = run("bash", [
    join(emergency, "build/emergency-build-ready.sh"),
    "--git-dir", repoRoot,
    "--sha", run("git", ["-C", repoRoot, "rev-parse", "HEAD"]).output.trim(),
    "--cache", emptyCache,
  ], { env: { PATH: `${curlTripwire}:${process.env.PATH}` }, allowFail: true });
  assert(notReady.status !== 0, "empty cache must not be emergency-build-ready");
  assert(notReady.output.includes("npm_cache_incomplete"), notReady.output);

  const fixture = join(root, "build-fixture");
  initRepo(fixture);
  mkdirSync(join(fixture, "vendor/leftpad"), { recursive: true });
  mkdirSync(join(fixture, "deploy/scripts"), { recursive: true });
  writeFileSync(join(fixture, "vendor/leftpad/package.json"), "{\"name\":\"leftpad\",\"version\":\"1.0.0\"}\n");
  writeFileSync(join(fixture, "package.json"), "{\"name\":\"fixture\",\"version\":\"1.0.0\",\"dependencies\":{\"leftpad\":\"file:vendor/leftpad\"}}\n");
  writeFileSync(join(fixture, "deploy/scripts/deploy.sh"), deploySh);
  const lock = run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--cache", emptyCache], {
    cwd: fixture,
    env: { PATH: `${curlTripwire}:${process.env.PATH}` },
  });
  assert(lock.status === 0, lock.output);
  git(fixture, ["add", "-A"]);
  git(fixture, ["commit", "-q", "-m", "fixture"]);
  const fixtureSha = git(fixture, ["rev-parse", "HEAD"]).output.trim();
  const ready = run("bash", [
    join(emergency, "build/emergency-build-ready.sh"),
    "--git-dir", fixture,
    "--sha", fixtureSha,
    "--cache", emptyCache,
  ], { env: { PATH: `${curlTripwire}:${process.env.PATH}` } });
  assert(ready.output.includes("emergency_build_ready=yes"), ready.output);
  const offlineSeed = run("bash", [
    join(emergency, "build/seed-npm-cache.sh"),
    "--git-dir", fixture,
    "--sha", fixtureSha,
    "--cache", join(root, "seed-cache"),
  ], { env: { AUDIOLAD_EMERGENCY_OFFLINE: "1" }, allowFail: true });
  assert(offlineSeed.status !== 0, "seed must refuse offline mode");

  if (existsSync(process.env.EMERGENCY_GITEA_BIN || "/tmp/gitea-bin/gitea")) {
    const bin = process.env.EMERGENCY_GITEA_BIN || "/tmp/gitea-bin/gitea";
    const gitea = run("bash", [join(emergency, "mirror/test-disposable-gitea.sh")], {
      env: { EMERGENCY_GITEA_BIN: bin },
    });
    assert(gitea.output.includes("disposable_gitea=ok"), gitea.output);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write("emergency-contour-unit=ok\n");
