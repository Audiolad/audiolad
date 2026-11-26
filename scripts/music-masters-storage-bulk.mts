import { loadProductionEnvFromCwd } from "./load-production-env.mts";
import {
  executeBulkBatch,
  parseBulkMigrationOptions,
  planBulkBatch,
  summarizeBulkProgress,
} from "../src/lib/music-storage/bulk-migration";
import {
  acquireBulkMigrationLock,
  installBulkMigrationSignalCleanup,
  releaseBulkMigrationLock,
} from "../src/lib/music-storage/bulk-process-lock";
import { evaluateS3QuotaBeforeCopy } from "../src/lib/music-storage/s3-quota-guard";

loadProductionEnvFromCwd();

async function main() {
  const options = parseBulkMigrationOptions(process.argv.slice(2));

  if (process.argv.includes("--progress-only")) {
    const totals = await summarizeBulkProgress(options.stage);
    console.log(JSON.stringify({ progressOnly: true, stage: options.stage, totals }, null, 2));
    return;
  }

  if (!options.execute) {
    const planned = await planBulkBatch(options);
    if (options.stage === "copy" && planned.batch.length > 0) {
      const batchBytes = planned.batch.reduce((sum, row) => sum + row.sizeBytes, 0);
      const s3Quota = await evaluateS3QuotaBeforeCopy(batchBytes);
      console.log(JSON.stringify({ ...planned, s3Quota }, null, 2));
      return;
    }
    console.log(JSON.stringify(planned, null, 2));
    return;
  }

  if (process.env.AUDIOLAD_MUSIC_STORAGE_BULK !== "1") {
    throw new Error("Execution requires AUDIOLAD_MUSIC_STORAGE_BULK=1");
  }
  if (options.stage === "release-local" && process.env.AUDIOLAD_MUSIC_STORAGE_RELEASE_LOCAL !== "1") {
    throw new Error("release-local requires AUDIOLAD_MUSIC_STORAGE_RELEASE_LOCAL=1");
  }
  if (options.stage === "cutover" && process.env.AUDIOLAD_MUSIC_STORAGE_CUTOVER !== "1") {
    throw new Error("cutover requires AUDIOLAD_MUSIC_STORAGE_CUTOVER=1");
  }

  const lock = acquireBulkMigrationLock();
  installBulkMigrationSignalCleanup();
  try {
    const result = await executeBulkBatch(options);
    console.log(JSON.stringify({ ...result, lock }, null, 2));
  } finally {
    releaseBulkMigrationLock();
  }
}

await main().catch((error) => {
  releaseBulkMigrationLock();
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});