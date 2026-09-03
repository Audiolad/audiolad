/**
 * One bounded queue pass; schedule externally only after the migration is applied.
 * PM2 must not start this script until an operator explicitly enables it.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";
import {
  renderStudioProjectToMp3,
  StudioRenderDurationError,
} from "../src/lib/studio/render/render";
import { renderOutputPath } from "../src/lib/studio/render/storage";
import type { StudioRenderSnapshot } from "../src/lib/studio/render/types";
import { renderAudiobookChapterToMp3 } from "../src/lib/audiobooks/render";
import { AUDIOBOOK_RENDERS_BUCKET, buildAudiobookChapterRenderStoragePath } from "../src/lib/audiobooks/storage";
import { audiobookRenderSnapshotSha256, parseAudiobookRenderSnapshot } from "../src/lib/audiobooks/render-snapshot";

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const assetsBucket = "studio-draft-assets";
const outputBucket = "studio-renders";

async function streamAudiobookFragmentToFile(storagePath: string, path: string) {
  const { data: signed, error: signError } = await service.storage
    .from("audiobook-fragments")
    .createSignedUrl(storagePath, 1800);
  if (signError || !signed?.signedUrl) throw new Error("source_unavailable");
  const response = await fetch(signed.signedUrl, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("source_unavailable");
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    createWriteStream(path),
  );
}

async function processAudiobookChapterRender() {
  await service.rpc("recover_stale_audiobook_chapter_render_jobs");
  const { data, error } = await service.rpc("claim_audiobook_chapter_render_job", { p_lease_seconds: 1800 });
  if (error) throw error;
  const job = Array.isArray(data) ? data[0] : data;
  if (!job || typeof job !== "object" || typeof job.id !== "string") return false;
  const workspace = join(tmpdir(), `audiolad-audiobook-render-${randomUUID()}`);
  try {
    const snapshot = parseAudiobookRenderSnapshot(job.fragment_snapshot, {
      authorId: job.author_id, projectId: job.project_id, chapterId: job.chapter_id,
    });
    if (!snapshot || audiobookRenderSnapshotSha256(snapshot) !== job.snapshot_sha256) throw new Error("snapshot_fingerprint_mismatch");
    const fragments = snapshot.fragments;
    await mkdir(workspace, { recursive: true });
    const paths: string[] = [];
    for (const [index, fragment] of fragments.entries()) {
      const path = join(workspace, `source-${index}`);
      await streamAudiobookFragmentToFile(fragment.storagePath, path);
      paths.push(path);
    }
    const result = await renderAudiobookChapterToMp3(paths, workspace, job.id);
    const outputPath = buildAudiobookChapterRenderStoragePath(job.author_id, job.project_id, job.chapter_id, job.id);
    const { error: uploadError } = await service.storage.from(AUDIOBOOK_RENDERS_BUCKET)
      .upload(outputPath, createReadStream(result.outputPath), { contentType: "audio/mpeg", upsert: true });
    if (uploadError) throw uploadError;
    const { data: completed, error: completeError } = await service.from("audiobook_chapter_render_jobs").update({
      status: "completed", output_storage_path: outputPath, output_size_bytes: result.sizeBytes,
      completed_at: new Date().toISOString(), lease_expires_at: null, updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "processing").eq("attempt_count", job.attempt_count).select("id").maybeSingle();
    if (completeError || !completed) {
      await service.storage.from(AUDIOBOOK_RENDERS_BUCKET).remove([outputPath]);
      throw new Error("render_job_completion_state_lost");
    }
    console.log(JSON.stringify({ event: "audiobook_chapter_render_completed", jobId: job.id, bytes: result.sizeBytes }));
  } catch (error) {
    const code = error instanceof Error && error.message === "snapshot_fingerprint_mismatch" ? "snapshot_fingerprint_mismatch" : "render_failed";
    await service.from("audiobook_chapter_render_jobs").update({
      status: "failed", error_code: code, error_message_safe: "Не удалось подготовить MP3 главы. Исходные фрагменты сохранены.",
      lease_expires_at: null, updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "processing").eq("attempt_count", job.attempt_count);
    throw error;
  } finally { await rm(workspace, { recursive: true, force: true }); }
  return true;
}

async function processAudiobookRenderQueuePass() {
  if (!await processAudiobookChapterRender()) console.log("audiobook-render-worker: no queued jobs");
}

async function processStudioRenderQueuePass() {
  await service.rpc("recover_stale_studio_render_jobs");
  const { data: claimed, error } = await service.rpc("claim_studio_render_job", { p_lease_seconds: 1800 });
  if (error) throw error;
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (
    !job ||
    typeof job !== "object" ||
    typeof job.id !== "string" ||
    !job.project_snapshot ||
    typeof job.project_snapshot !== "object"
  ) {
    console.log("studio-render-worker: no queued jobs");
    return;
  }
  const workspace = join(tmpdir(), `audiolad-render-${randomUUID()}`);
  try {
    await mkdir(workspace, { recursive: true });
    const snapshot = job.project_snapshot as StudioRenderSnapshot;
    const paths = new Map<string, string>();
    for (const asset of snapshot.assets) {
      const { data, error: downloadError } = await service.storage.from(assetsBucket).download(asset.storagePath);
      if (downloadError || !data) throw new Error("source_unavailable");
      const path = join(workspace, `${asset.id}.audio`);
      await writeFile(path, Buffer.from(await data.arrayBuffer()));
      paths.set(asset.id, path);
    }
    const result = await renderStudioProjectToMp3(
      { snapshot, localAssetPaths: paths },
      { renderId: job.id, outputDirectory: workspace },
    );
    console.log(JSON.stringify({
      event: "studio_render_completed",
      jobId: job.id,
      projectId: job.project_id,
      snapshotRevision: snapshot.project.revision,
      expectedTimelineDurationSeconds: result.expectedDurationSeconds,
      perTrackMaxEndSeconds: snapshot.tracks.map((track) => ({
        trackId: track.id,
        maxEndSeconds: Math.max(...track.clips.map((clip) => clip.startTime + clip.duration)),
      })),
      actualDurationSeconds: result.actualDurationSeconds,
      durationDeltaSeconds: result.durationDeltaSeconds,
      ffmpegExitCode: 0,
      ffmpegStderrSummary: result.stderr.slice(-1000),
    }));
    const outputPath = renderOutputPath(job.id);
    const bytes = await readFile(result.outputPath);
    const { error: uploadError } = await service.storage
      .from(outputBucket)
      .upload(outputPath, bytes, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) throw uploadError;
    const { data: completedJob, error: completionError } = await service
      .from("studio_render_jobs")
      .update({
        status: "completed",
        output_storage_path: outputPath,
        completed_at: new Date().toISOString(),
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (completionError || !completedJob) throw new Error("render_job_completion_state_lost");
    if (typeof job.guest_session_id === "string" && job.guest_session_id) {
      const consumedAt = new Date().toISOString();
      const { error: entitlementError } = await service
        .from("studio_guest_sessions")
        .update({
          free_render_consumed_at: consumedAt,
          free_render_project_id: job.project_id,
          free_render_job_id: job.id,
        })
        .eq("id", job.guest_session_id)
        .is("free_render_consumed_at", null);
      if (entitlementError) {
        console.error("studio-render-worker: guest entitlement update failed", entitlementError.message);
      }
    }
    console.log(JSON.stringify({ jobId: job.id, status: "completed", bytes: result.sizeBytes }));
  } catch (error) {
    const errorCode = error instanceof StudioRenderDurationError
      ? error.code
      : "render_failed";
    console.error(JSON.stringify({
      event: "studio_render_failed",
      jobId: job.id,
      projectId: job.project_id,
      snapshotRevision: (job.project_snapshot as StudioRenderSnapshot).project?.revision ?? null,
      errorCode,
      error: error instanceof Error ? error.message : "unknown_error",
    }));
    const { data: failedJob, error: failureUpdateError } = await service
      .from("studio_render_jobs")
      .update({
        status: "failed",
        error_code: errorCode,
        error_message_safe: "Не удалось подготовить экспорт. Исходники проекта сохранены.",
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (failureUpdateError || !failedJob) {
      console.error("studio-render-worker: failure state was not persisted", failureUpdateError?.message);
    }
    throw error;
  } finally { await rm(workspace, { recursive: true, force: true }); }
}
async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("render_worker_environment_missing");
  const results = await Promise.allSettled([
    processStudioRenderQueuePass(),
    processAudiobookRenderQueuePass(),
  ]);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  for (const result of results) {
    if (result.status === "rejected") console.error("render-worker queue pass failed:", result.reason);
  }
  if (failed) throw failed.reason;
}
void main().catch((error) => { console.error("studio-render-worker:", error); process.exitCode = 1; });
