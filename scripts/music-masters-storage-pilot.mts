import { loadProductionEnvFromCwd } from "./load-production-env.mts";
import {
  copyPilotAsset,
  cutoverPilotAsset,
  rehydrateLocalSupabaseCopy,
  rollbackPilotAsset,
  type PilotAssetRow,
} from "../src/lib/music-storage/pilot-asset-ops";

loadProductionEnvFromCwd();
import { createServiceRoleClient } from "../src/lib/supabase/service-role";

type Mode = "copy" | "cutover" | "rollback" | "rehydrate-local";

function argumentsFrom(argv: string[]): {
  mode: Mode;
  execute: boolean;
  assetIds: string[];
  limit: number | null;
} {
  let mode: Mode = "copy";
  let execute = false;
  let limit: number | null = null;
  const assetIds: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") execute = true;
    else if (argument === "--mode") {
      const value = argv[index + 1];
      if (value !== "copy" && value !== "cutover" && value !== "rollback" && value !== "rehydrate-local") {
        throw new Error("--mode must be copy, cutover, rollback or rehydrate-local");
      }
      mode = value;
      index += 1;
    } else if (argument === "--asset-id") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("--asset-id requires a UUID");
      assetIds.push(value);
      index += 1;
    } else if (argument === "--limit") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 20) {
        throw new Error("--limit must be between 1 and 20");
      }
      limit = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (assetIds.length === 0 && limit === null) {
    throw new Error("Pass an explicit --asset-id allowlist or --limit (maximum 20)");
  }
  if (assetIds.length > 20) throw new Error("At most 20 --asset-id values are allowed");
  if ((execute || mode !== "copy") && assetIds.length === 0) {
    throw new Error("Execution, cutover and rollback require an explicit --asset-id allowlist");
  }
  return { mode, execute, assetIds: [...new Set(assetIds)], limit };
}

async function loadAssets(input: ReturnType<typeof argumentsFrom>): Promise<PilotAssetRow[]> {
  const service = createServiceRoleClient();
  let query = service
    .from("music_audio_assets")
    .select("id,storage_provider,storage_bucket,storage_path,accepted_mime_type,size_bytes,content_sha256,asset_role,lifecycle_state")
    .eq("asset_role", "master")
    .eq("lifecycle_state", "verified")
    .order("created_at", { ascending: true });
  if (input.assetIds.length > 0) query = query.in("id", input.assetIds);
  if (input.limit !== null) query = query.limit(input.limit);
  const { data, error } = await query;
  if (error) throw new Error(`asset_lookup_failed:${error.message}`);
  const assets = (data ?? []) as PilotAssetRow[];
  if (input.assetIds.length > 0 && assets.length !== input.assetIds.length) {
    throw new Error("One or more allowlisted assets are missing or not verified masters");
  }
  return assets;
}

async function main() {
  const input = argumentsFrom(process.argv.slice(2));
  const assets = await loadAssets(input);
  if (!input.execute) {
    console.log(JSON.stringify({
      dryRun: true,
      mode: input.mode,
      assets: assets.map((asset) => ({
        id: asset.id,
        provider: asset.storage_provider ?? "supabase_file",
        bucket: asset.storage_bucket,
        path: asset.storage_path,
        sizeBytes: Number(asset.size_bytes),
        checksumRecorded: Boolean(asset.content_sha256),
      })),
      next: "Re-run with --execute and AUDIOLAD_MUSIC_STORAGE_PILOT=1 after reviewing this exact allowlist.",
    }, null, 2));
    return;
  }
  if (process.env.AUDIOLAD_MUSIC_STORAGE_PILOT !== "1") {
    throw new Error("Execution requires AUDIOLAD_MUSIC_STORAGE_PILOT=1");
  }
  const results: Array<{ id: string; outcome: string }> = [];
  for (const asset of assets) {
    const outcome = input.mode === "copy"
      ? await copyPilotAsset(asset)
      : input.mode === "cutover"
        ? await cutoverPilotAsset(asset)
        : input.mode === "rehydrate-local"
          ? await rehydrateLocalSupabaseCopy(asset)
          : await rollbackPilotAsset(asset);
    results.push({ id: asset.id, outcome });
  }
  console.log(JSON.stringify({ dryRun: false, mode: input.mode, results }, null, 2));
}

await main().catch((error) => {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});