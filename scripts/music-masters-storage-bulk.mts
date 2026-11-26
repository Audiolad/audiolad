import {
  executeBulkBatch,
  parseBulkMigrationOptions,
  planBulkBatch,
  summarizeBulkProgress,
} from "../src/lib/music-storage/bulk-migration";

async function main() {
  const options = parseBulkMigrationOptions(process.argv.slice(2));

  if (process.argv.includes("--progress-only")) {
    const totals = await summarizeBulkProgress(options.stage);
    console.log(JSON.stringify({ progressOnly: true, stage: options.stage, totals }, null, 2));
    return;
  }

  if (!options.execute) {
    const planned = await planBulkBatch(options);
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

  const result = await executeBulkBatch(options);
  console.log(JSON.stringify(result, null, 2));
}

await main().catch((error) => {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});