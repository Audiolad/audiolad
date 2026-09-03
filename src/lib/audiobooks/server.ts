import "server-only";

import { randomUUID } from "node:crypto";

import { AuthorAccessError, requireAuthorMembership, requireAuthorMutationMembership } from "@/lib/author-products/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  AUDIOBOOK_FRAGMENTS_BUCKET,
  AUDIOBOOK_RENDERS_BUCKET,
  buildAudiobookFragmentStoragePath,
  isAudiobookActiveFragmentStoragePath, isAudiobookChapterRenderStoragePath, isAudiobookFragmentStoragePath,
  normalizeAudiobookMimeType,
  validateAudiobookOriginalFilename,
} from "./storage";
import { AUDIOBOOK_LIMITS } from "./limits";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import {
  audiobookRenderSnapshotSha256,
  createAudiobookRenderSnapshot,
  type AudiobookRenderSnapshot,
} from "./render-snapshot";

const PROJECT_SELECT = "id, author_id, title, book_author_name, narrator_name, status, created_at, updated_at";
const CHAPTER_SELECT = "id, project_id, position, title, status, created_at, updated_at";
const FRAGMENT_SELECT = "id, chapter_id, position, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type, status, created_at, updated_at";

export type AudiobookProject = {
  id: string; author_id: string; title: string; book_author_name: string | null;
  narrator_name: string | null; status: "active"; created_at: string; updated_at: string;
};
export type AudiobookChapter = {
  id: string; project_id: string; position: number; title: string; status: "draft";
  created_at: string; updated_at: string;
};
export type AudiobookFragment = {
  id: string; chapter_id: string; position: number; storage_path: string;
  original_name: string; mime_type: string; size_bytes: number;
  duration_seconds: number | null; source_type: "upload" | "recording"; status: "uploading" | "active";
  created_at: string; updated_at: string;
};
export type AudiobookChapterRenderJob = {
  id: string; project_id: string; chapter_id: string; author_id: string;
  fragment_snapshot: AudiobookRenderSnapshot;
  snapshot_sha256: string; status: "queued" | "processing" | "completed" | "failed";
  output_storage_path: string | null; output_size_bytes: number | null; error_code: string | null; error_message_safe: string | null;
  created_at: string; completed_at: string | null;
};
export type AudiobookChapterRenderState = {
  job: AudiobookChapterRenderJob | null;
  isCurrent: boolean;
};

export class AudiobookError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

export function parseAudiobookUuid(value: unknown, code = "invalid_id") {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AudiobookError(code, 404);
  }
  return value;
}

export function parseAudiobookTitle(value: unknown) {
  if (typeof value !== "string") throw new AudiobookError("invalid_title", 422);
  const title = value.trim();
  if (!title || title.length > 200) throw new AudiobookError("invalid_title", 422);
  return title;
}

async function readAccess(authorId: string) {
  try { await requireAuthorMembership(authorId); }
  catch (error) {
    if (error instanceof AuthorAccessError && error.code === "forbidden") throw new AudiobookError("not_found", 404);
    throw error;
  }
}
async function mutationAccess(authorId: string) {
  try { await requireAuthorMutationMembership(authorId); }
  catch (error) {
    if (error instanceof AuthorAccessError && error.code === "forbidden") throw new AudiobookError("not_found", 404);
    throw error;
  }
}
function fail(error: { message: string } | null, label: string): never {
  console.error(label, { message: error?.message });
  throw new AudiobookError("internal_error", 500);
}

async function removeFragmentStorage(paths: string[], context: Record<string, string>) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const { error } = await createServiceRoleClient().storage
    .from(AUDIOBOOK_FRAGMENTS_BUCKET).remove(unique);
  if (error) console.error("audiobook_fragment_storage_cleanup_error", {
    ...context, paths: unique, message: error.message,
  });
}

async function listChapterFragmentPaths(chapterId: string) {
  const { data, error } = await createServiceRoleClient().from("audiobook_fragments")
    .select("storage_path").eq("chapter_id", chapterId);
  if (error) fail(error, "audiobook_fragments_list_cleanup_error");
  return (data ?? []).map((fragment) => fragment.storage_path).filter((path): path is string => typeof path === "string");
}

async function listChapterRenderPaths(chapterId: string) {
  const { data, error } = await createServiceRoleClient().from("audiobook_chapter_render_jobs")
    .select("output_storage_path").eq("chapter_id", chapterId).not("output_storage_path", "is", null);
  if (error) fail(error, "audiobook_render_paths_list_cleanup_error");
  return (data ?? []).map((job) => job.output_storage_path).filter((path): path is string => typeof path === "string");
}

async function removeRenderStorage(paths: string[], context: Record<string, string>) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const { error } = await createServiceRoleClient().storage.from(AUDIOBOOK_RENDERS_BUCKET).remove(unique);
  if (error) console.error("audiobook_render_storage_cleanup_error", { ...context, paths: unique, message: error.message });
}

export async function listAudiobookProjects(authorId: string) {
  await readAccess(authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_projects")
    .select(`${PROJECT_SELECT}, audiobook_chapters(count)`).eq("author_id", authorId)
    .eq("status", "active").order("updated_at", { ascending: false }).order("id", { ascending: false });
  if (error) fail(error, "audiobook_projects_list_error");
  return (data ?? []).map((row) => ({ ...(row as AudiobookProject), chapter_count: Array.isArray(row.audiobook_chapters) ? row.audiobook_chapters[0]?.count ?? 0 : 0 }));
}

export async function getAudiobookProject(projectId: string, authorId: string) {
  await readAccess(authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_projects").select(PROJECT_SELECT)
    .eq("id", projectId).eq("author_id", authorId).eq("status", "active").maybeSingle();
  if (error) fail(error, "audiobook_project_get_error");
  if (!data) throw new AudiobookError("not_found", 404);
  return data as AudiobookProject;
}

export async function listAudiobookChapters(projectId: string, authorId: string) {
  await getAudiobookProject(projectId, authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_chapters").select(CHAPTER_SELECT)
    .eq("project_id", projectId).order("position", { ascending: true }).order("id", { ascending: true });
  if (error) fail(error, "audiobook_chapters_list_error");
  return (data ?? []) as AudiobookChapter[];
}

export async function createAudiobookProject(authorId: string, title: string) {
  await mutationAccess(authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_projects")
    .insert({ author_id: authorId, title }).select(PROJECT_SELECT).single();
  if (error || !data) fail(error, "audiobook_project_create_error");
  return data as AudiobookProject;
}

export async function renameAudiobookProject(projectId: string, authorId: string, title: string) {
  await mutationAccess(authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_projects").update({ title })
    .eq("id", projectId).eq("author_id", authorId).eq("status", "active").select(PROJECT_SELECT).maybeSingle();
  if (error) fail(error, "audiobook_project_rename_error");
  if (!data) throw new AudiobookError("not_found", 404);
  return data as AudiobookProject;
}

export async function deleteAudiobookProject(projectId: string, authorId: string) {
  await mutationAccess(authorId);
  await getAudiobookProject(projectId, authorId);
  const service = createServiceRoleClient();
  const { data: chapters, error: chaptersError } = await service.from("audiobook_chapters")
    .select("id").eq("project_id", projectId);
  if (chaptersError) fail(chaptersError, "audiobook_project_fragments_cleanup_list_error");
  const chapterIds = (chapters ?? []).map((chapter) => chapter.id);
  const { data: fragments, error: fragmentsError } = chapterIds.length
    ? await service.from("audiobook_fragments").select("storage_path").in("chapter_id", chapterIds)
    : { data: [], error: null };
  if (fragmentsError) fail(fragmentsError, "audiobook_project_fragments_cleanup_list_error");
  const renderPaths = chapterIds.length
    ? await Promise.all(chapterIds.map((chapterId) => listChapterRenderPaths(chapterId))).then((paths) => paths.flat())
    : [];
  const { data, error } = await service.from("audiobook_projects").delete()
    .eq("id", projectId).eq("author_id", authorId).eq("status", "active").select("id").maybeSingle();
  if (error) fail(error, "audiobook_project_delete_error");
  if (!data) throw new AudiobookError("not_found", 404);
  await removeFragmentStorage(
    (fragments ?? []).map((fragment) => fragment.storage_path).filter((path): path is string => typeof path === "string"),
    { projectId, authorId },
  );
  await removeRenderStorage(renderPaths, { projectId, authorId });
}

export async function createAudiobookChapter(projectId: string, authorId: string, title: string) {
  await mutationAccess(authorId);
  await getAudiobookProject(projectId, authorId);
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("create_audiobook_chapter", {
    p_project_id: projectId,
    p_title: title,
  });
  if (error || !data) fail(error, "audiobook_chapter_create_error");
  return data as AudiobookChapter;
}

async function ownedChapter(projectId: string, chapterId: string, authorId: string) {
  await getAudiobookProject(projectId, authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_chapters").select(CHAPTER_SELECT)
    .eq("id", chapterId).eq("project_id", projectId).maybeSingle();
  if (error) fail(error, "audiobook_chapter_get_error");
  if (!data) throw new AudiobookError("not_found", 404);
  return data as AudiobookChapter;
}

export async function renameAudiobookChapter(projectId: string, chapterId: string, authorId: string, title: string) {
  await mutationAccess(authorId); await ownedChapter(projectId, chapterId, authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_chapters").update({ title })
    .eq("id", chapterId).eq("project_id", projectId).select(CHAPTER_SELECT).maybeSingle();
  if (error) fail(error, "audiobook_chapter_rename_error");
  if (!data) throw new AudiobookError("not_found", 404);
  return data as AudiobookChapter;
}

export async function deleteAudiobookChapter(projectId: string, chapterId: string, authorId: string) {
  await mutationAccess(authorId); await ownedChapter(projectId, chapterId, authorId);
  const service = createServiceRoleClient();
  const fragmentPaths = await listChapterFragmentPaths(chapterId);
  const renderPaths = await listChapterRenderPaths(chapterId);
  const { error } = await service.rpc("delete_audiobook_chapter", {
    p_project_id: projectId,
    p_chapter_id: chapterId,
  });
  if (error) fail(error, "audiobook_chapter_delete_error");
  await removeFragmentStorage(fragmentPaths, { projectId, chapterId, authorId });
  await removeRenderStorage(renderPaths, { projectId, chapterId, authorId });
}

export async function reorderAudiobookChapters(projectId: string, authorId: string, chapterIds: unknown) {
  await mutationAccess(authorId);
  if (!Array.isArray(chapterIds)) throw new AudiobookError("invalid_reorder", 422);
  const ids = chapterIds.map((id) => parseAudiobookUuid(id, "invalid_reorder"));
  if (new Set(ids).size !== ids.length) throw new AudiobookError("invalid_reorder", 422);
  await getAudiobookProject(projectId, authorId);
  const { error } = await createServiceRoleClient().rpc("reorder_audiobook_chapters", { p_project_id: projectId, p_chapter_ids: ids });
  if (error) throw new AudiobookError(error.message.includes("not_found") ? "not_found" : "invalid_reorder", error.message.includes("not_found") ? 404 : 422);
  return listAudiobookChapters(projectId, authorId);
}

export async function listAudiobookFragments(projectId: string, chapterId: string, authorId: string) {
  await ownedChapter(projectId, chapterId, authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_fragments")
    .select(FRAGMENT_SELECT).eq("chapter_id", chapterId)
    .order("position", { ascending: true }).order("id", { ascending: true });
  if (error) fail(error, "audiobook_fragments_list_error");
  return (data ?? []) as AudiobookFragment[];
}

const AUDIOBOOK_PLAYBACK_EXPIRES_IN = 900;

export async function createAudiobookFragmentPlaybackUrl(
  projectId: string,
  chapterId: string,
  fragmentId: string,
  authorId: string,
) {
  await ownedChapter(projectId, chapterId, authorId);
  const service = createServiceRoleClient();
  const { data: fragment, error } = await service.from("audiobook_fragments")
    .select(FRAGMENT_SELECT).eq("id", fragmentId).eq("chapter_id", chapterId)
    .eq("status", "active").maybeSingle();
  if (error) fail(error, "audiobook_fragment_playback_lookup_error");
  if (!fragment) throw new AudiobookError("not_found", 404);
  if (!isAudiobookActiveFragmentStoragePath(fragment.storage_path, authorId, projectId, chapterId, fragmentId)) {
    console.error("audiobook_fragment_playback_path_invalid", { projectId, chapterId, fragmentId });
    throw new AudiobookError("not_found", 404);
  }

  const { data: signed, error: signedError } = await service.storage
    .from(AUDIOBOOK_FRAGMENTS_BUCKET)
    .createSignedUrl(fragment.storage_path, AUDIOBOOK_PLAYBACK_EXPIRES_IN);
  const url = signed?.signedUrl ? normalizeStorageSignedUrl(signed.signedUrl) : null;
  if (signedError || !url) {
    console.error("audiobook_fragment_playback_sign_error", {
      projectId, chapterId, fragmentId, message: signedError?.message,
    });
    throw new AudiobookError("playback_unavailable", 500);
  }
  return { url, expiresAt: new Date(Date.now() + AUDIOBOOK_PLAYBACK_EXPIRES_IN * 1000).toISOString() };
}

export async function reserveAudiobookFragment(input: {
  projectId: string; chapterId: string; authorId: string;
  originalName: unknown; mimeType: unknown; sizeBytes: unknown; sourceType: unknown;
}) {
  await mutationAccess(input.authorId);
  const chapter = await ownedChapter(input.projectId, input.chapterId, input.authorId);
  const originalName = validateAudiobookOriginalFilename(input.originalName);
  const mimeType = normalizeAudiobookMimeType(input.mimeType);
  const sizeBytes = typeof input.sizeBytes === "number" ? input.sizeBytes : NaN;
  if (!originalName || !mimeType || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > AUDIOBOOK_LIMITS.maxFragmentBytes) {
    throw new AudiobookError("invalid_fragment", 422);
  }
  if (input.sourceType !== "upload" && input.sourceType !== "recording") throw new AudiobookError("invalid_fragment", 422);
  const id = randomUUID();
  const storagePath = buildAudiobookFragmentStoragePath(input.authorId, input.projectId, input.chapterId, id, mimeType);
  const service = createServiceRoleClient();
  const { data: fragment, error } = await service.rpc("reserve_audiobook_fragment", {
    p_project_id: input.projectId, p_chapter_id: input.chapterId, p_fragment_id: id,
    p_storage_path: storagePath, p_original_name: originalName, p_mime_type: mimeType,
    p_size_bytes: sizeBytes, p_source_type: input.sourceType,
  });
  if (error || !fragment) {
    if (error?.message.includes("quota_exceeded")) throw new AudiobookError("quota_exceeded", 422);
    fail(error, "audiobook_fragment_reserve_error");
  }
  const { data: signed, error: signedError } = await service.storage.from(AUDIOBOOK_FRAGMENTS_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (signedError || !signed) {
    await service.rpc("delete_audiobook_fragment", {
      p_project_id: input.projectId, p_chapter_id: input.chapterId, p_fragment_id: id,
    });
    fail(signedError, "audiobook_fragment_signed_upload_error");
  }
  void chapter;
  return { fragment: fragment as AudiobookFragment, signedUpload: { path: signed.path, token: signed.token } };
}

export async function retryAudiobookFragmentUpload(projectId: string, chapterId: string, fragmentId: string, authorId: string) {
  await mutationAccess(authorId);
  await ownedChapter(projectId, chapterId, authorId);
  const service = createServiceRoleClient();
  const { data: fragment, error } = await service.from("audiobook_fragments").select(FRAGMENT_SELECT)
    .eq("id", fragmentId).eq("chapter_id", chapterId).eq("status", "uploading").maybeSingle();
  if (error) fail(error, "audiobook_fragment_retry_get_error");
  if (!fragment) throw new AudiobookError("not_found", 404);

  let uploadFragment = fragment as AudiobookFragment;
  if (!isAudiobookFragmentStoragePath(fragment.storage_path, authorId, projectId, chapterId, fragmentId)) {
    const repairedPath = buildAudiobookFragmentStoragePath(authorId, projectId, chapterId, fragmentId, fragment.mime_type);
    const { data: repaired, error: repairError } = await service.from("audiobook_fragments")
      .update({ storage_path: repairedPath })
      .eq("id", fragmentId).eq("chapter_id", chapterId).eq("status", "uploading")
      .select(FRAGMENT_SELECT).maybeSingle();
    if (repairError || !repaired) fail(repairError, "audiobook_fragment_retry_repair_error");
    uploadFragment = repaired as AudiobookFragment;
    void removeFragmentStorage([fragment.storage_path], { projectId, chapterId, fragmentId, authorId });
  }
  const { data: signed, error: signedError } = await service.storage.from(AUDIOBOOK_FRAGMENTS_BUCKET)
    .createSignedUploadUrl(uploadFragment.storage_path, { upsert: false });
  if (signedError || !signed) fail(signedError, "audiobook_fragment_retry_signed_upload_error");
  return { fragment: uploadFragment, signedUpload: { path: signed.path, token: signed.token } };
}

export async function finalizeAudiobookFragment(projectId: string, chapterId: string, fragmentId: string, authorId: string) {
  await mutationAccess(authorId);
  await ownedChapter(projectId, chapterId, authorId);
  const service = createServiceRoleClient();
  const { data: fragment, error } = await service.from("audiobook_fragments").select(FRAGMENT_SELECT)
    .eq("id", fragmentId).eq("chapter_id", chapterId).maybeSingle();
  if (error) fail(error, "audiobook_fragment_finalize_get_error");
  if (!fragment) throw new AudiobookError("not_found", 404);
  if (!isAudiobookFragmentStoragePath(fragment.storage_path, authorId, projectId, chapterId, fragmentId)) {
    throw new AudiobookError("upload_not_complete", 409);
  }
  const directory = fragment.storage_path.slice(0, fragment.storage_path.lastIndexOf("/"));
  const filename = fragment.storage_path.slice(fragment.storage_path.lastIndexOf("/") + 1);
  const { data: objects, error: objectError } = await service.storage.from(AUDIOBOOK_FRAGMENTS_BUCKET)
    .list(directory, { limit: 1, search: filename });
  const object = objects?.find((entry) => entry.name === filename);
  const metadata = object?.metadata as { size?: number | string; mimetype?: string } | undefined;
  if (objectError || !object || Number(metadata?.size) !== Number(fragment.size_bytes) || normalizeAudiobookMimeType(metadata?.mimetype) !== fragment.mime_type) {
    console.error("audiobook_fragment_finalize_storage_invalid", { projectId, chapterId, fragmentId, message: objectError?.message });
    throw new AudiobookError("upload_not_complete", 409);
  }
  const { data: finalized, error: finalizeError } = await service.rpc("finalize_audiobook_fragment", {
    p_project_id: projectId, p_chapter_id: chapterId, p_fragment_id: fragmentId,
  });
  if (finalizeError || !finalized) fail(finalizeError, "audiobook_fragment_finalize_error");
  return finalized as AudiobookFragment;
}

export async function deleteAudiobookFragment(projectId: string, chapterId: string, fragmentId: string, authorId: string) {
  await mutationAccess(authorId);
  await ownedChapter(projectId, chapterId, authorId);
  const { data: storagePath, error } = await createServiceRoleClient().rpc("delete_audiobook_fragment", {
    p_project_id: projectId, p_chapter_id: chapterId, p_fragment_id: fragmentId,
  });
  if (error || typeof storagePath !== "string") {
    if (error?.message.includes("not_found")) throw new AudiobookError("not_found", 404);
    fail(error, "audiobook_fragment_delete_error");
  }
  await removeFragmentStorage([storagePath], { projectId, chapterId, fragmentId, authorId });
}

const RENDER_SELECT = "id, project_id, chapter_id, author_id, fragment_snapshot, snapshot_sha256, status, output_storage_path, output_size_bytes, error_code, error_message_safe, created_at, completed_at";

export async function createAudiobookChapterRenderJob(projectId: string, chapterId: string, authorId: string) {
  await mutationAccess(authorId);
  await ownedChapter(projectId, chapterId, authorId);
  const fragments = await listAudiobookFragments(projectId, chapterId, authorId);
  const active = fragments.filter((fragment) => fragment.status === "active");
  if (!active.length) throw new AudiobookError("no_active_fragments", 422);
  const fragment_snapshot = createAudiobookRenderSnapshot(active.map((fragment) => ({
    id: fragment.id, storagePath: fragment.storage_path, position: fragment.position,
    mimeType: fragment.mime_type, sizeBytes: fragment.size_bytes,
  })), { authorId, projectId, chapterId });
  const { data, error } = await createServiceRoleClient().from("audiobook_chapter_render_jobs").insert({
    project_id: projectId, chapter_id: chapterId, author_id: authorId, fragment_snapshot,
    snapshot_sha256: audiobookRenderSnapshotSha256(fragment_snapshot),
  }).select(RENDER_SELECT).single();
  if (error?.code === "23505") {
    const state = await getAudiobookChapterRenderState(projectId, chapterId, authorId);
    if (state.job?.status === "queued" || state.job?.status === "processing") return state.job;
    fail(error, "audiobook_chapter_render_idempotent_lookup_error");
  }
  if (error || !data) fail(error, "audiobook_chapter_render_create_error");
  return data as AudiobookChapterRenderJob;
}

export async function getAudiobookChapterRenderState(projectId: string, chapterId: string, authorId: string) {
  await ownedChapter(projectId, chapterId, authorId);
  const { data, error } = await createServiceRoleClient().from("audiobook_chapter_render_jobs")
    .select(RENDER_SELECT).eq("project_id", projectId).eq("chapter_id", chapterId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) fail(error, "audiobook_chapter_render_state_error");
  const job = (data ?? null) as AudiobookChapterRenderJob | null;
  if (!job) return { job: null, isCurrent: false };
  const fragments = await listAudiobookFragments(projectId, chapterId, authorId);
  const active = fragments.filter((fragment) => fragment.status === "active").map((fragment) => ({
    id: fragment.id, storagePath: fragment.storage_path, position: fragment.position,
    mimeType: fragment.mime_type, sizeBytes: fragment.size_bytes,
  }));
  let isCurrent = false;
  try {
    isCurrent = active.length > 0
      && audiobookRenderSnapshotSha256(createAudiobookRenderSnapshot(active, { authorId, projectId, chapterId }))
        === job.snapshot_sha256;
  } catch { isCurrent = false; }
  return { job, isCurrent };
}

export async function downloadAudiobookChapterRender(projectId: string, chapterId: string, authorId: string) {
  const state = await getAudiobookChapterRenderState(projectId, chapterId, authorId);
  const job = state.job;
  if (!job || !state.isCurrent || job.status !== "completed" || !job.output_storage_path
    || !isAudiobookChapterRenderStoragePath(job.output_storage_path, authorId, projectId, chapterId, job.id)) {
    throw new AudiobookError("not_found", 404);
  }
  const filename = `Глава-${chapterId}.mp3`;
  const { data, error } = await createServiceRoleClient().storage.from(AUDIOBOOK_RENDERS_BUCKET)
    .createSignedUrl(job.output_storage_path, 300, { download: filename });
  const url = data?.signedUrl ? normalizeStorageSignedUrl(data.signedUrl) : null;
  if (error || !url) throw new AudiobookError("not_found", 404);
  return { url, job };
}
