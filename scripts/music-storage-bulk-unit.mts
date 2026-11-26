import assert from "node:assert/strict";

import {
  isTransientMusicStorageError,
  readHostGuardSnapshot,
  retryBackoffMs,
} from "../src/lib/music-storage/host-guards";
import { parseBulkMigrationOptions } from "../src/lib/music-storage/bulk-migration";

const options = parseBulkMigrationOptions([
  "--stage",
  "cutover",
  "--batch-size",
  "10",
  "--concurrency",
  "2",
  "--after-asset-id",
  "00000000-0000-4000-8000-000000000001",
]);
assert.equal(options.stage, "cutover");
assert.equal(options.batchSize, 10);
assert.equal(options.concurrency, 2);
assert.equal(options.afterAssetId, "00000000-0000-4000-8000-000000000001");
assert.equal(options.execute, false);

assert.throws(
  () => parseBulkMigrationOptions(["--concurrency", "9"]),
  /--concurrency must be between 1 and 4/,
);

assert.equal(retryBackoffMs(1), 15_000);
assert.equal(retryBackoffMs(3), 60_000);

assert.equal(isTransientMusicStorageError(new Error("fetch failed")), true);
assert.equal(isTransientMusicStorageError(new Error("target_checksum_mismatch")), false);

const host = readHostGuardSnapshot({
  diskWarningPercent: 85,
  diskPausePercent: 88,
  diskCriticalPercent: 90,
  minFreeBytes: 1,
  loadAvg1Max: 999,
});
assert.ok(["ok", "warning", "pause", "critical"].includes(host.level));

console.log("music-storage-bulk-unit: ok");