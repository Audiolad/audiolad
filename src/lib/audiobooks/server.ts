import "server-only";

import { AuthorAccessError, requireAuthorMembership, requireAuthorMutationMembership } from "@/lib/author-products/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const PROJECT_SELECT = "id, author_id, title, book_author_name, narrator_name, status, created_at, updated_at";
const CHAPTER_SELECT = "id, project_id, position, title, status, created_at, updated_at";

export type AudiobookProject = {
  id: string; author_id: string; title: string; book_author_name: string | null;
  narrator_name: string | null; status: "active"; created_at: string; updated_at: string;
};
export type AudiobookChapter = {
  id: string; project_id: string; position: number; title: string; status: "draft";
  created_at: string; updated_at: string;
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
  console.error(label, error?.message);
  throw new AudiobookError("internal_error", 500);
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
  const { data, error } = await createServiceRoleClient().from("audiobook_projects").delete()
    .eq("id", projectId).eq("author_id", authorId).eq("status", "active").select("id").maybeSingle();
  if (error) fail(error, "audiobook_project_delete_error");
  if (!data) throw new AudiobookError("not_found", 404);
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
  const { error } = await service.rpc("delete_audiobook_chapter", {
    p_project_id: projectId,
    p_chapter_id: chapterId,
  });
  if (error) fail(error, "audiobook_chapter_delete_error");
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
