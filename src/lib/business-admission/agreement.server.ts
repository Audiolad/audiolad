import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SoundReviewQueue, SoundReviewRow } from "@/lib/business/track-sound-review";
import { restrictSoundQueueToAgreement } from "@/lib/business/track-sound-review";
import { filterAgreementSubjects, type AgreementDecision, type AgreementSubject } from "@/lib/business-admission/agreement-list";

const CHUNK = 25;

/** Account-level Business agreement, the same function the catalogue sync uses. Fail closed. */
export async function businessAgreementAuthorIds(authorIds: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(authorIds.filter((id) => id))];
  const accepted = new Set<string>();
  if (!unique.length) return accepted;
  const db = createServiceRoleClient();
  for (let index = 0; index < unique.length; index += CHUNK) {
    const chunk = unique.slice(index, index + CHUNK);
    const results = await Promise.all(chunk.map(async (id) => {
      const { data, error } = await db.rpc("author_has_business_agreement", { p_author_id: id });
      if (error) throw new Error("agreement_unavailable");
      return data === true ? id : null;
    }));
    for (const id of results) if (id) accepted.add(id);
  }
  return accepted;
}

async function everyRow(load: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await load(from, from + 999);
    if (error) throw new Error("unavailable");
    const page = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export async function listAgreementAdmissionPage(input: {
  kind: "artist" | "album";
  query: string;
  direction: string | null;
  decision: string | null;
  offset: number;
  limit: number;
  directions: readonly { key: string }[];
}): Promise<{ rows: AgreementSubject[]; total: number; decisions: AgreementDecision[] }> {
  const db = createServiceRoleClient();
  const artists = (await everyRow((from, to) => db.from("authors").select("id, name").range(from, to))).map((row) => ({ id: String(row.id), name: String(row.name ?? "") }));
  const albums = (await everyRow((from, to) => db.from("practices").select("id, title, author_id").eq("product_kind", "music").is("deleted_at", null).range(from, to)))
    .map((row) => ({ id: String(row.id), title: String(row.title ?? ""), authorId: String(row.author_id ?? "") }));
  const accepted = await businessAgreementAuthorIds(input.kind === "artist" ? artists.map((row) => row.id) : albums.map((row) => row.authorId));
  const authorIds = [...accepted];
  const albumIds = albums.filter((album) => accepted.has(album.authorId)).map((album) => album.id);
  const decisions: AgreementDecision[] = [];
  for (let index = 0; index < authorIds.length; index += 100) {
    const { data, error } = await db.from("business_content_admissions").select("author_id, practice_id, direction_key, allowed, changed_by, changed_at").in("author_id", authorIds.slice(index, index + 100));
    if (error) throw new Error("unavailable");
    decisions.push(...((data ?? []) as AgreementDecision[]));
  }
  for (let index = 0; index < albumIds.length; index += 100) {
    const { data, error } = await db.from("business_content_admissions").select("author_id, practice_id, direction_key, allowed, changed_by, changed_at").in("practice_id", albumIds.slice(index, index + 100));
    if (error) throw new Error("unavailable");
    decisions.push(...((data ?? []) as AgreementDecision[]));
  }
  const listed = filterAgreementSubjects({
    ...input, artists, albums, acceptedAuthorIds: accepted, decisions,
  });
  const visibleIds = new Set(listed.rows.flatMap((row) => [row.id, row.authorId]));
  return {
    rows: listed.rows,
    total: listed.total,
    decisions: decisions.filter((row) => (row.author_id && visibleIds.has(row.author_id)) || (row.practice_id && visibleIds.has(row.practice_id))),
  };
}

export async function admissionAuthorsAccepted(kind: "artist" | "album", ids: readonly string[]): Promise<boolean> {
  const db = createServiceRoleClient();
  let authorIds = [...ids];
  if (kind === "album") {
    const { data, error } = await db.from("practices").select("id, author_id").in("id", [...ids]);
    if (error || !Array.isArray(data) || data.length !== ids.length) return false;
    authorIds = (data as { author_id: string | null }[]).map((row) => row.author_id ?? "");
  }
  const accepted = await businessAgreementAuthorIds(authorIds);
  return authorIds.every((id) => accepted.has(id));
}

export async function loadAgreementSoundQueue(
  db: SupabaseClient,
  filter: { status?: string; artist?: string; album?: string; space?: string; page?: number },
): Promise<SoundReviewQueue> {
  const rows: SoundReviewRow[] = [];
  let reported = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 1000 && rows.length < reported; page += 1) {
    const { data, error } = await db.rpc("admin_business_sound_queue", { p_status: null, p_artist: null, p_album: null, p_space: null, p_page: page });
    if (error || !data) throw new Error("queue_unavailable");
    const payload = data as { rows?: SoundReviewRow[]; total?: number };
    if (!Array.isArray(payload.rows) || typeof payload.total !== "number") throw new Error("queue_unavailable");
    reported = payload.total;
    rows.push(...payload.rows);
    if (!payload.rows.length) break;
  }
  const accepted = await businessAgreementAuthorIds(rows.map((row) => row.artist_id));
  return restrictSoundQueueToAgreement(rows, accepted, filter);
}
