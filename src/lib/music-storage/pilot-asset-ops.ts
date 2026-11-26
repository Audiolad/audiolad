import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  downloadMusicStorageObjectToFile,
  headMusicStorageObject,
  removeMusicStorageObject,
  uploadMusicStorageObjectFromFile,
  type MusicStorageProvider,
} from "@/lib/music-storage/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type PilotAssetRow = {
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
  source_released_at?: string | null;
};

export function pilotByteSize(asset: PilotAssetRow): number {
  const value = Number(asset.size_bytes);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid_asset_size");
  return value;
}

export function pilotLocation(asset: PilotAssetRow, provider: MusicStorageProvider) {
  return {
    storage_provider: provider,
    storage_bucket: asset.storage_bucket,
    storage_path: asset.storage_path,
  };
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyStoredChecksum(
  asset: PilotAssetRow,
  provider: MusicStorageProvider,
  expectedSha256: string,
): Promise<boolean> {
  const service = createServiceRoleClient();
  const workspace = await mkdtemp(join(tmpdir(), "audiolad-master-verify-"));
  try {
    const path = join(workspace, "object");
    await downloadMusicStorageObjectToFile(pilotLocation(asset, provider), path, {
      service,
      expectedBytes: pilotByteSize(asset),
    });
    return await sha256File(path) === expectedSha256;
  } catch {
    return false;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function copyPilotAsset(asset: PilotAssetRow): Promise<string> {
  if ((asset.storage_provider ?? "supabase_file") !== "supabase_file") {
    throw new Error("copy_source_is_not_supabase_file");
  }
  const service = createServiceRoleClient();
  const size = pilotByteSize(asset);
  const { data: prior } = await service
    .from("music_storage_copies")
    .select("id,status,attempt_count,source_sha256,target_sha256")
    .eq("asset_id", asset.id)
    .eq("target_provider", "timeweb_s3")
    .eq("storage_bucket", asset.storage_bucket)
    .eq("storage_path", asset.storage_path)
    .maybeSingle<CopyRow>();
  if (
    prior
    && (prior.status === "verified" || prior.status === "rolled_back")
    && prior.source_sha256
    && prior.source_sha256 === prior.target_sha256
    && (!asset.content_sha256 || asset.content_sha256 === prior.source_sha256)
    && await verifyStoredChecksum(asset, "timeweb_s3", prior.source_sha256)
  ) {
    if (prior.status === "rolled_back") {
      const now = new Date().toISOString();
      const { error: reconcileError } = await service
        .from("music_storage_copies")
        .update({
          status: "verified",
          rolled_back_at: null,
          last_error_code: null,
          updated_at: now,
        })
        .eq("id", prior.id);
      if (reconcileError) throw new Error("copy_reconcile_failed");
    }
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
      pilotLocation(asset, "supabase_file"),
      sourcePath,
      { service, expectedBytes: size },
    );
    const sourceHash = await sha256File(sourcePath);
    if (asset.content_sha256 && asset.content_sha256 !== sourceHash) {
      throw new Error("source_checksum_changed");
    }
    await uploadMusicStorageObjectFromFile(
      pilotLocation(asset, "timeweb_s3"),
      sourcePath,
      {
        service,
        contentType: asset.accepted_mime_type || "application/octet-stream",
        upsert: true,
      },
    );
    await downloadMusicStorageObjectToFile(
      pilotLocation(asset, "timeweb_s3"),
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

export async function cutoverPilotAsset(asset: PilotAssetRow): Promise<string> {
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
  const size = pilotByteSize(asset);
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
    || (copy.status !== "verified" && copy.status !== "rolled_back")
    || copy.source_sha256 !== asset.content_sha256
    || copy.target_sha256 !== asset.content_sha256
  ) throw new Error("verified_copy_missing");
  const target = await headMusicStorageObject(pilotLocation(asset, "timeweb_s3"), service);
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

export async function rollbackPilotAsset(asset: PilotAssetRow): Promise<string> {
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
      pilotLocation(asset, "supabase_file"),
      sourcePath,
      { service, expectedBytes: pilotByteSize(asset) },
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

/** Delete the Supabase copy after cutover. Does not change the asset provider. */
export async function releaseLocalSupabaseCopy(asset: PilotAssetRow): Promise<string> {
  const service = createServiceRoleClient();
  if ((asset.storage_provider ?? "supabase_file") !== "timeweb_s3") {
    throw new Error("release_requires_timeweb_provider");
  }
  if (!asset.content_sha256) throw new Error("asset_checksum_missing");
  const { data: copy } = await service
    .from("music_storage_copies")
    .select("id,status,source_sha256,target_sha256,source_released_at")
    .eq("asset_id", asset.id)
    .eq("target_provider", "timeweb_s3")
    .eq("storage_bucket", asset.storage_bucket)
    .eq("storage_path", asset.storage_path)
    .maybeSingle<CopyRow>();
  if (!copy || copy.status !== "cutover") throw new Error("cutover_copy_missing");
  if (copy.source_released_at) return "already_released";
  const size = pilotByteSize(asset);
  const target = await headMusicStorageObject(pilotLocation(asset, "timeweb_s3"), service);
  if (
    !target
    || target.sizeBytes !== size
    || !await verifyStoredChecksum(asset, "timeweb_s3", asset.content_sha256)
  ) throw new Error("s3_target_not_verified");
  const localHead = await headMusicStorageObject(pilotLocation(asset, "supabase_file"), service);
  if (!localHead || localHead.sizeBytes !== size) throw new Error("local_copy_missing");

  const workspace = await mkdtemp(join(tmpdir(), "audiolad-master-release-"));
  try {
    const localPath = join(workspace, "local-final");
    await downloadMusicStorageObjectToFile(
      pilotLocation(asset, "supabase_file"),
      localPath,
      { service, expectedBytes: size },
    );
    const localHash = await sha256File(localPath);
    if (localHash !== asset.content_sha256) throw new Error("local_predelete_checksum_mismatch");
    const s3Path = join(workspace, "s3-final");
    await downloadMusicStorageObjectToFile(
      pilotLocation(asset, "timeweb_s3"),
      s3Path,
      { service, expectedBytes: size },
    );
    const s3Hash = await sha256File(s3Path);
    if (s3Hash !== asset.content_sha256 || s3Hash !== localHash) {
      throw new Error("s3_predelete_checksum_mismatch");
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  const removed = await removeMusicStorageObject(
    pilotLocation(asset, "supabase_file"),
    service,
  );
  if (!removed) throw new Error("local_copy_delete_failed");
  const now = new Date().toISOString();
  const { error } = await service
    .from("music_storage_copies")
    .update({ source_released_at: now, updated_at: now })
    .eq("id", copy.id);
  if (error) throw new Error("release_ledger_write_failed");
  return "local_released";
}

/**
 * Restore a Supabase duplicate from S3 after release-local (provider stays timeweb_s3).
 * Enables rollback paths that need a local copy without deleting S3.
 */
export async function rehydrateLocalSupabaseCopy(asset: PilotAssetRow): Promise<string> {
  const service = createServiceRoleClient();
  if ((asset.storage_provider ?? "supabase_file") !== "timeweb_s3") {
    throw new Error("rehydrate_requires_timeweb_provider");
  }
  if (!asset.content_sha256) throw new Error("asset_checksum_missing");
  const size = pilotByteSize(asset);
  const localHead = await headMusicStorageObject(pilotLocation(asset, "supabase_file"), service);
  if (localHead && localHead.sizeBytes === size) return "local_already_present";

  const workspace = await mkdtemp(join(tmpdir(), "audiolad-master-rehydrate-"));
  try {
    const sourcePath = join(workspace, "s3-source");
    await downloadMusicStorageObjectToFile(
      pilotLocation(asset, "timeweb_s3"),
      sourcePath,
      { service, expectedBytes: size },
    );
    const hash = await sha256File(sourcePath);
    if (hash !== asset.content_sha256) throw new Error("s3_rehydrate_checksum_mismatch");
    await uploadMusicStorageObjectFromFile(
      pilotLocation(asset, "supabase_file"),
      sourcePath,
      {
        service,
        contentType: asset.accepted_mime_type || "application/octet-stream",
        upsert: true,
      },
    );
    const verifyPath = join(workspace, "local-verify");
    await downloadMusicStorageObjectToFile(
      pilotLocation(asset, "supabase_file"),
      verifyPath,
      { service, expectedBytes: size },
    );
    if (await sha256File(verifyPath) !== asset.content_sha256) {
      throw new Error("local_rehydrate_verify_failed");
    }
    const { data: copy } = await service
      .from("music_storage_copies")
      .select("id,source_released_at")
      .eq("asset_id", asset.id)
      .eq("target_provider", "timeweb_s3")
      .maybeSingle();
    if (copy?.source_released_at) {
      const now = new Date().toISOString();
      await service
        .from("music_storage_copies")
        .update({ source_released_at: null, updated_at: now })
        .eq("id", copy.id);
    }
    return "local_rehydrated";
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}