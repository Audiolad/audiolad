import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  downloadMusicStorageObjectToFile,
  headMusicStorageObject,
  uploadMusicStorageObjectFromFile,
  type MusicStorageProvider,
} from "../src/lib/music-storage/server";
import { createServiceRoleClient } from "../src/lib/supabase/service-role";

type Mode = "copy" | "cutover" | "rollback";

type AssetRow = {
  id: string;
  storage_provider: string | null;
  storage_bucket: string;
  storage_path: string;
  accepted_mime_type: string;
  size_bytes: number | string | null;
  content_sha256: string | null;
  asset_role: string;
  lifecycle_state: string;
};

type CopyRow = {
  id: string;
  status: string;
  attempt_count: number;
  source_sha256: string | null;
  target_sha256: string | null;
};

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
      if (value !== "copy" && value !== "cutover" && value !== "rollback") {
        throw new Error("--mode must be copy, cutover or rollback");
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

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function byteSize(asset: AssetRow): number {
  const value = Number(asset.size_bytes);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid_asset_size");
  return value;
}

function location(asset: AssetRow, provider: MusicStorageProvider) {
  return {
    storage_provider: provider,
    storage_bucket: asset.storage_bucket,
    storage_path: asset.storage_path,
  };
}

async function verifyStoredChecksum(
  asset: AssetRow,
  provider: MusicStorageProvider,
  expectedSha256: string,
): Promise<boolean> {
  const service = createServiceRoleClient();
  const workspace = await mkdtemp(join(tmpdir(), "audiolad-master-verify-"));
  try {
    const path = join(workspace, "object");
    await downloadMusicStorageObjectToFile(location(asset, provider), path, {
      service,
      expectedBytes: byteSize(asset),
    });
    return await sha256File(path) === expectedSha256;
  } catch {
    return false;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function loadAssets(input: ReturnType<typeof argumentsFrom>): Promise<AssetRow[]> {
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
  const assets = (data ?? []) as AssetRow[];
  if (input.assetIds.length > 0 && assets.length !== input.assetIds.length) {
    throw new Error("One or more allowlisted assets are missing or not verified masters");
  }
  return assets;
}

async function copyAsset(asset: AssetRow): Promise<string> {
  if ((asset.storage_provider ?? "supabase_file") !== "supabase_file") {
    throw new Error("copy_source_is_not_supabase_file");
  }
  const service = createServiceRoleClient();
  const size = byteSize(asset);
  const { data: prior } = await service
    .from("music_storage_copies")
    .select("id,status,attempt_count,source_sha256,target_sha256")
    .eq("asset_id", asset.id)
    .eq("target_provider", "timeweb_s3")
    .eq("storage_bucket", asset.storage_bucket)
    .eq("storage_path", asset.storage_path)
    .maybeSingle<CopyRow>();
  if (
    prior?.status === "verified"
    && prior.source_sha256
    && prior.source_sha256 === prior.target_sha256
    && (!asset.content_sha256 || asset.content_sha256 === prior.source_sha256)
    && await verifyStoredChecksum(asset, "timeweb_s3", prior.source_sha256)
  ) {
    if (!asset.content_sha256) {
      const { error: repairError } = await service
        .from("music_audio_assets")
        .update({
          content_sha256: prior.source_sha256,
          updated_at: new Date().toISOString(),
        })
        .eq("id", asset.id)
        .eq("storage_provider", "supabase_file")
        .is("content_sha256", null);
      if (repairError) throw new Error("asset_checksum_repair_failed");
    }
    return "already_verified";
  }

  const attempt = (prior?.attempt_count ?? 0) + 1;
  const ledger = {
    asset_id: asset.id,
    source_provider: "supabase_file",
    target_provider: "timeweb_s3",
    storage_bucket: asset.storage_bucket,
    storage_path: asset.storage_path,
    size_bytes: size,
    status: "copying",
    attempt_count: attempt,
    last_error_code: null,
    updated_at: new Date().toISOString(),
  };
  const { data: copy, error: ledgerError } = await service
    .from("music_storage_copies")
    .upsert(ledger, {
      onConflict: "asset_id,target_provider,storage_bucket,storage_path",
    })
    .select("id")
    .single();
  if (ledgerError || !copy) throw new Error("copy_ledger_write_failed");

  const workspace = await mkdtemp(join(tmpdir(), "audiolad-master-copy-"));
  try {
    const sourcePath = join(workspace, "source");
    const targetPath = join(workspace, "target");
    await downloadMusicStorageObjectToFile(
      location(asset, "supabase_file"),
      sourcePath,
      { service, expectedBytes: size },
    );
    const sourceHash = await sha256File(sourcePath);
    if (asset.content_sha256 && asset.content_sha256 !== sourceHash) {
      throw new Error("source_checksum_changed");
    }
    await uploadMusicStorageObjectFromFile(
      location(asset, "timeweb_s3"),
      sourcePath,
      {
        service,
        contentType: asset.accepted_mime_type || "application/octet-stream",
        upsert: true,
      },
    );
    await downloadMusicStorageObjectToFile(
      location(asset, "timeweb_s3"),
      targetPath,
      { service, expectedBytes: size },
    );
    const targetHash = await sha256File(targetPath);
    if (sourceHash !== targetHash) throw new Error("target_checksum_mismatch");

    const now = new Date().toISOString();
    const { error: verifyError } = await service
      .from("music_storage_copies")
      .update({
        status: "verified",
        source_sha256: sourceHash,
        target_sha256: targetHash,
        verified_at: now,
        last_error_code: null,
        updated_at: now,
      })
      .eq("id", copy.id);
    if (verifyError) throw new Error("copy_ledger_verify_failed");
    const { error: hashError } = await service
      .from("music_audio_assets")
      .update({ content_sha256: sourceHash, updated_at: now })
      .eq("id", asset.id)
      .eq("storage_provider", "supabase_file");
    if (hashError) throw new Error("asset_checksum_write_failed");
    return sourceHash;
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "copy_failed";
    await service
      .from("music_storage_copies")
      .update({
        status: "failed",
        last_error_code: code,
        updated_at: new Date().toISOString(),
      })
      .eq("id", copy.id);
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function cutoverAsset(asset: AssetRow): Promise<string> {
  const service = createServiceRoleClient();
  if ((asset.storage_provider ?? "supabase_file") === "timeweb_s3") {
    const { error } = await service.from("music_storage_copies")
      .update({
        status: "cutover",
        cutover_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("asset_id", asset.id)
      .eq("target_provider", "timeweb_s3");
    if (error) throw new Error("cutover_ledger_reconcile_failed");
    return "already_cut_over";
  }
  if (!asset.content_sha256) throw new Error("asset_checksum_missing");
  const size = byteSize(asset);
  const { data: copy } = await service
    .from("music_storage_copies")
    .select("id,status,source_sha256,target_sha256")
    .eq("asset_id", asset.id)
    .eq("target_provider", "timeweb_s3")
    .eq("storage_bucket", asset.storage_bucket)
    .eq("storage_path", asset.storage_path)
    .maybeSingle<CopyRow>();
  if (
    !copy
    || copy.status !== "verified"
    || copy.source_sha256 !== asset.content_sha256
    || copy.target_sha256 !== asset.content_sha256
  ) throw new Error("verified_copy_missing");
  const target = await headMusicStorageObject(location(asset, "timeweb_s3"), service);
  if (
    !target
    || target.sizeBytes !== size
    || !await verifyStoredChecksum(asset, "timeweb_s3", asset.content_sha256)
  ) throw new Error("verified_target_missing");
  const now = new Date().toISOString();
  const { data: changed, error } = await service
    .from("music_audio_assets")
    .update({ storage_provider: "timeweb_s3", updated_at: now })
    .eq("id", asset.id)
    .eq("storage_provider", "supabase_file")
    .select("id")
    .maybeSingle();
  if (error || !changed) throw new Error("cutover_race");
  const { error: ledgerError } = await service.from("music_storage_copies")
    .update({ status: "cutover", cutover_at: now, updated_at: now })
    .eq("id", copy.id);
  if (ledgerError) throw new Error("cutover_ledger_write_failed");
  return "cut_over";
}

async function rollbackAsset(asset: AssetRow): Promise<string> {
  const service = createServiceRoleClient();
  if ((asset.storage_provider ?? "supabase_file") === "supabase_file") {
    const now = new Date().toISOString();
    const { error } = await service.from("music_storage_copies")
      .update({ status: "rolled_back", rolled_back_at: now, updated_at: now })
      .eq("asset_id", asset.id)
      .eq("target_provider", "timeweb_s3");
    if (error) throw new Error("rollback_ledger_reconcile_failed");
    return "already_local";
  }
  if (!asset.content_sha256) throw new Error("asset_checksum_missing");
  const workspace = await mkdtemp(join(tmpdir(), "audiolad-master-rollback-"));
  try {
    const sourcePath = join(workspace, "local-source");
    await downloadMusicStorageObjectToFile(
      location(asset, "supabase_file"),
      sourcePath,
      { service, expectedBytes: byteSize(asset) },
    );
    if (await sha256File(sourcePath) !== asset.content_sha256) {
      throw new Error("rollback_source_checksum_mismatch");
    }
    const now = new Date().toISOString();
    const { data: changed, error } = await service
      .from("music_audio_assets")
      .update({ storage_provider: "supabase_file", updated_at: now })
      .eq("id", asset.id)
      .eq("storage_provider", "timeweb_s3")
      .select("id")
      .maybeSingle();
    if (error || !changed) throw new Error("rollback_race");
    const { error: ledgerError } = await service.from("music_storage_copies")
      .update({ status: "rolled_back", rolled_back_at: now, updated_at: now })
      .eq("asset_id", asset.id)
      .eq("target_provider", "timeweb_s3");
    if (ledgerError) throw new Error("rollback_ledger_write_failed");
    return "rolled_back";
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
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
      ? await copyAsset(asset)
      : input.mode === "cutover"
        ? await cutoverAsset(asset)
        : await rollbackAsset(asset);
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
