import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  defaultOrchestratorState,
  orchestratorPause,
  orchestratorResume,
  orchestratorStart,
  orchestratorStop,
  readOrchestratorState,
  writeOrchestratorState,
} from "../src/lib/music-storage/bulk-orchestrator";
import { parseBulkMigrationOptions } from "../src/lib/music-storage/bulk-migration";

const dir = mkdtempSync(join(tmpdir(), "audiolad-music-orch-"));
const statePath = join(dir, "orchestrator.json");
process.env.AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_STATE = statePath;

function cleanup() {
  rmSync(dir, { recursive: true, force: true });
}

try {
  assert.equal(parseBulkMigrationOptions(["--progress-only", "--stage", "copy"]).progressOnly, true);

  writeOrchestratorState(defaultOrchestratorState("copy"));
  orchestratorStart("copy");
  assert.equal(readOrchestratorState().runMode, "running");
  orchestratorPause();
  assert.equal(readOrchestratorState().runMode, "paused");
  orchestratorResume();
  assert.equal(readOrchestratorState().runMode, "running");
  orchestratorStop();
  assert.equal(readOrchestratorState().runMode, "stopped");

  orchestratorStart("copy", true);
  const state = readOrchestratorState();
  assert.equal(state.afterAssetId, null);
  assert.equal(state.journal.catalogRescanEachTick, true);
  state.afterAssetId = "00000000-0000-4000-8000-000000000001";
  writeOrchestratorState(state);
  assert.equal(readOrchestratorState().afterAssetId, null);

  writeFileSync(join(dir, "deploy-commit"), "a".repeat(40), "utf8");
  process.env.AUDIOLAD_DEPLOY_COMMIT_FILE = join(dir, "deploy-commit");
  orchestratorStop();
  orchestratorStart("cutover", true);
  assert.equal(readOrchestratorState().stage, "cutover");

  console.log("music-storage-bulk-orchestrator-unit: PASS");
} finally {
  delete process.env.AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_STATE;
  delete process.env.AUDIOLAD_DEPLOY_COMMIT_FILE;
  cleanup();
}