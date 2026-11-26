import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(join(root, ".github/workflows/production-deploy.yml"), "utf8");
const runbook = readFileSync(join(root, "docs/runbooks/music-masters-bulk-orchestrator.md"), "utf8");

for (const token of [
  "OPS_MUSIC_STORAGE_BULK_STATUS",
  "OPS_MUSIC_STORAGE_BULK_START_COPY",
  "OPS_MUSIC_STORAGE_BULK_PAUSE",
  "OPS_MUSIC_STORAGE_BULK_STOP",
  "music_storage_bulk_ops:",
  "audiolad-music-storage-bulk-ops-remote.sh",
]) {
  assert.match(workflow, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.match(runbook, /systemctl.*audiolad-music-storage-bulk-copy.timer/);
assert.match(runbook, /--progress-only/);

console.log("music-storage-orchestrator-deploy-unit: ok");