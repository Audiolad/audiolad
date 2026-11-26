import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProductionEnvFromCwd } from "./load-production-env";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const NODE_OPTIONS = "--require ./scripts/cjs-stub-server-only.cjs";
const LOAD_ENV_IMPORT_ERROR = /Cannot destructure property 'loadEnvConfig'/;

function testLoadProductionEnvFromCwdInTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "audiolad-load-prod-env-"));
  const marker = "audiolad-load-prod-env-marker";
  writeFileSync(join(dir, ".env.production"), `${marker}=from-env-file\n`, "utf8");
  const previousCwd = process.cwd();
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = mutableEnv.NODE_ENV;
  const previousMarker = mutableEnv[marker];
  try {
    process.chdir(dir);
    mutableEnv.NODE_ENV = "production";
    delete mutableEnv[marker];
    loadProductionEnvFromCwd();
    assert.equal(mutableEnv[marker], "from-env-file");
  } finally {
    process.chdir(previousCwd);
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
    if (previousMarker === undefined) delete mutableEnv[marker];
    else mutableEnv[marker] = previousMarker;
  }
}

function testMusicStorageReportCliBootUnderProductionTsx() {
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/music-storage-report.mts"],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_OPTIONS,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const combined = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  assert.doesNotMatch(combined, LOAD_ENV_IMPORT_ERROR);
  assert.doesNotMatch(combined, /import_env\.default/);
  assert.notEqual(result.status, null, "tsx child should exit");
}

function main() {
  testLoadProductionEnvFromCwdInTempDir();
  testMusicStorageReportCliBootUnderProductionTsx();
  console.log("load-production-env-unit: PASS");
}

main();