import { type ChildProcess, spawn, spawnSync } from "node:child_process";

export function deployLockPath(): string {
  return process.env.DEPLOY_LOCK_FILE?.trim() || "/run/audiolad-deploy.lock";
}

/** Non-blocking probe: true when another process holds the production deploy flock. */
export function isDeployLockHeld(): boolean {
  const path = deployLockPath();
  const result = spawnSync("flock", ["-n", path, "-c", "true"], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return process.env.AUDIOLAD_DEPLOY_LOCK_FAIL_CLOSED === "0" ? false : true;
    }
    return true;
  }
  return result.status !== 0;
}

/**
 * Hold the same flock deploy.sh uses for the duration of a bulk batch.
 * Returns null when deploy (or another holder) already owns the lock.
 */
export function tryAcquireDeployLockForBulk(): { release: () => void } | null {
  const path = deployLockPath();
  const child: ChildProcess = spawn("flock", ["-n", path, "sleep", "86400"], {
    stdio: "ignore",
  });
  const deadline = Date.now() + 250;
  while (child.exitCode === null && Date.now() < deadline) {
    spawnSync("sleep", ["0.01"]);
  }
  if (child.exitCode !== null) {
    return null;
  }
  return {
    release: () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    },
  };
}