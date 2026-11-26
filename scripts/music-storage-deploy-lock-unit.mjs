import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const orchShell = readFileSync(
  join(root, "deploy/scripts/audiolad-music-storage-bulk-orchestrator.sh"),
  "utf8",
);
assert.match(orchShell, /flock -n "\$DEPLOY_LOCK_FILE"/);
assert.match(orchShell, /flock_required_for_deploy_lock/);

const ts = readFileSync(join(root, "src/lib/music-storage/deploy-lock-probe.ts"), "utf8");
assert.match(ts, /spawnSync\("flock", \["-n", path, "-c", "true"\]/);
assert.match(ts, /tryAcquireDeployLockForBulk/);

if (spawnSync("command", ["-v", "flock"], { encoding: "utf8" }).status === 0) {
  const tmp = spawnSync("mktemp", [], { encoding: "utf8" }).stdout.trim();
  const hold = spawnSync("flock", ["-n", tmp, "sleep", "2"], {
    detached: true,
    stdio: "ignore",
  });
  assert.equal(hold.status, null);
  spawnSync("sleep", ["0.05"]);
  const blocked = spawnSync("flock", ["-n", tmp, "-c", "true"], { encoding: "utf8" });
  assert.notEqual(blocked.status, 0);
  spawnSync("pkill", ["-f", `flock -n ${tmp}`], { encoding: "utf8" });
}

console.log("music-storage-deploy-lock-unit: ok");