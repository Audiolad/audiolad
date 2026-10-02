import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { MusicAnalyzerRunRow } from "./contract";
import { MUSIC_ANALYZER_RUNS_BUCKET } from "./constants";

export class MusicAnalyzerStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MusicAnalyzerStorageError";
  }
}

const RUN_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "status",
  "source_filename",
  "sha256",
  "byte_size",
  "mime_type",
  "storage_bucket",
  "storage_path",
  "version_number",
  "analyzer_version",
  "analyzer_git_commit",
  "analyzer_content_commit",
  "model_checkpoint",
  "taxonomy_version",
  "prompt_version",
  "device",
  "raw_json",
  "normalized_json",
  "provenance",
  "error_code",
  "started_at",
  "finished_at",
  "attempt_count",
].join(", ");

function client(): SupabaseClient {
  try {
    return createServiceRoleClient();
  } catch {
    throw new MusicAnalyzerStorageError("storage_unavailable");
  }
}

function asRow(value: unknown): MusicAnalyzerRunRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as MusicAnalyzerRunRow;
  if (!row.id || !row.sha256 || !row.status) return null;
  return row;
}

export async function listMusicAnalyzerRuns(limit = 50): Promise<MusicAnalyzerRunRow[]> {
  const { data, error } = await client()
    .from("music_analyzer_runs")
    .select(RUN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new MusicAnalyzerStorageError("storage_unavailable");
  return (data ?? []).map(asRow).filter((row): row is MusicAnalyzerRunRow => Boolean(row));
}

export async function listMusicAnalyzerRunsBySha(sha256: string): Promise<MusicAnalyzerRunRow[]> {
  const { data, error } = await client()
    .from("music_analyzer_runs")
    .select(RUN_COLUMNS)
    .eq("sha256", sha256)
    .order("version_number", { ascending: true });
  if (error) throw new MusicAnalyzerStorageError("storage_unavailable");
  return (data ?? []).map(asRow).filter((row): row is MusicAnalyzerRunRow => Boolean(row));
}

export async function getMusicAnalyzerRun(id: string): Promise<MusicAnalyzerRunRow | null> {
  const { data, error } = await client()
    .from("music_analyzer_runs")
    .select(RUN_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new MusicAnalyzerStorageError("storage_unavailable");
  return asRow(data);
}

export async function enqueueMusicAnalyzerRun(input: {
  id: string;
  createdBy: string;
  sourceFilename: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
  storagePath: string;
}): Promise<MusicAnalyzerRunRow> {
  const { data, error } = await client().rpc("enqueue_music_analyzer_run", {
    p_id: input.id,
    p_created_by: input.createdBy,
    p_source_filename: input.sourceFilename,
    p_sha256: input.sha256,
    p_byte_size: input.byteSize,
    p_mime_type: input.mimeType,
    p_storage_path: input.storagePath,
  });
  if (error || !data) throw new MusicAnalyzerStorageError("enqueue_failed");
  const row = asRow(data);
  if (!row) throw new MusicAnalyzerStorageError("enqueue_failed");
  return row;
}

export async function createMusicAnalyzerSignedUpload(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await client()
    .storage
    .from(MUSIC_ANALYZER_RUNS_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token || data.path !== path) {
    throw new MusicAnalyzerStorageError("upload_unavailable");
  }
  return { path: data.path, token: data.token };
}

export async function downloadMusicAnalyzerObject(path: string): Promise<Uint8Array> {
  const { data, error } = await client().storage.from(MUSIC_ANALYZER_RUNS_BUCKET).download(path);
  if (error || !data) throw new MusicAnalyzerStorageError("object_missing");
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeMusicAnalyzerObject(path: string): Promise<void> {
  await client().storage.from(MUSIC_ANALYZER_RUNS_BUCKET).remove([path]);
}
