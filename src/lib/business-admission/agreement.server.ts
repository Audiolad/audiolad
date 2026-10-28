import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SoundReviewRow } from "@/lib/business/track-sound-review";
import { restrictSoundQueueToAgreement } from "@/lib/business/track-sound-review";
import { authorIdsWithVerifiedRights, filterAgreementSubjects, type AgreementDecision, type AgreementSubject } from "@/lib/business-admission/agreement-list";
import type { SectorDecision } from "@/lib/business-admission/sectors";

/** Same table and status as /admin/business-verification «Пример подтверждён». Restricted, rejected and revoked stay out. */
export async function verifiedRightsAuthorIds(): Promise<Set<string>> {
  const db = createServiceRoleClient();
  const verifications: { owner_user_id: string; status: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("business_rightsholder_verifications")
      .select("owner_user_id, status").eq("status", "verified").range(from, from + 999);
    if (error) throw new Error("verification_unavailable");
    const page = (data ?? []) as { owner_user_id?: string; status?: string }[];
    for (const row of page) {
      if (row.status === "verified" && row.owner_user_id) verifications.push({ owner_user_id: row.owner_user_id, status: row.status });
    }
    if (page.length < 1000) break;
  }
  const owners = [...new Set(verifications.map((row) => row.owner_user_id))];
  const memberships: { user_id: string; author_id: string; role: string }[] = [];
  for (let index = 0; index < owners.length; index += 100) {
    const { data, error } = await db.from("author_members").select("user_id, author_id, role")
      .in("user_id", owners.slice(index, index + 100)).eq("role", "owner");
    if (error) throw new Error("verification_unavailable");
    for (const row of (data ?? []) as { user_id?: string; author_id?: string; role?: string }[]) {
      if (row.user_id && row.author_id && row.role) memberships.push({ user_id: row.user_id, author_id: row.author_id, role: row.role });
    }
  }
  return authorIdsWithVerifiedRights(verifications, memberships);
}

export async function hiddenArtistIds(): Promise<Set<string>> {
  const db = createServiceRoleClient();
  const ids = new Set<string>();
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("business_admission_hidden_artists").select("author_id").range(from, from + 999);
    if (error) throw new Error("hidden_unavailable");
    const page = (data ?? []) as { author_id?: string }[];
    for (const row of page) if (row.author_id) ids.add(row.author_id);
    if (page.length < 1000) break;
  }
  return ids;
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
  hiddenOnly?: boolean;
}): Promise<{ rows: AgreementSubject[]; total: number; decisions: AgreementDecision[] }> {
  const db = createServiceRoleClient();
  const artists = (await everyRow((from, to) => db.from("authors").select("id, name").range(from, to))).map((row) => ({ id: String(row.id), name: String(row.name ?? "") }));
  const albums = (await everyRow((from, to) => db.from("practices").select("id, title, author_id").eq("product_kind", "music").is("deleted_at", null).range(from, to)))
    .map((row) => ({ id: String(row.id), title: String(row.title ?? ""), authorId: String(row.author_id ?? "") }));
  const accepted = await verifiedRightsAuthorIds();
  const hidden = await hiddenArtistIds();
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
    ...input, artists, albums, acceptedAuthorIds: accepted, decisions, hiddenAuthorIds: hidden,
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
  const accepted = await verifiedRightsAuthorIds();
  return authorIds.every((id) => accepted.has(id));
}

export async function admissionAuthorsVisible(kind: "artist" | "album", ids: readonly string[]): Promise<boolean> {
  if (!await admissionAuthorsAccepted(kind, ids)) return false;
  const db = createServiceRoleClient();
  let authorIds = [...ids];
  if (kind === "album") {
    const { data, error } = await db.from("practices").select("id, author_id").in("id", [...ids]);
    if (error || !Array.isArray(data)) return false;
    authorIds = (data as { author_id: string | null }[]).map((row) => row.author_id ?? "");
  }
  const hidden = await hiddenArtistIds();
  return authorIds.every((id) => !hidden.has(id));
}

export type SectorAlbum = {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  sectors: Record<string, SectorDecision>;
  admitted: boolean;
};

/** Verified, visible artists. Includes albums that have no sector decision yet. */
export async function listSectorAlbums(focusIds: readonly string[]): Promise<{
  directions: { key: string; name: string }[];
  albums: SectorAlbum[];
}> {
  const db = createServiceRoleClient();
  const { data: directionRows, error: directionError } = await db.from("business_content_directions")
    .select("key, name, sort_order").eq("active", true);
  if (directionError) throw new Error("unavailable");
  const directions = ((directionRows ?? []) as { key: string; name: string; sort_order?: number }[])
    .slice()
    .sort((left, right) => (left.sort_order ?? 100) - (right.sort_order ?? 100) || (left.key < right.key ? -1 : 1))
    .map((row) => ({ key: row.key, name: row.name }));
  const accepted = await verifiedRightsAuthorIds();
  const hidden = await hiddenArtistIds();
  const artists = (await everyRow((from, to) => db.from("authors").select("id, name").range(from, to)))
    .map((row) => ({ id: String(row.id), name: String(row.name ?? "") }));
  const names = new Map(artists.map((artist) => [artist.id, artist.name]));
  const albums = (await everyRow((from, to) => db.from("practices").select("id, title, author_id").eq("product_kind", "music").is("deleted_at", null).range(from, to)))
    .map((row) => ({ id: String(row.id), title: String(row.title ?? ""), authorId: String(row.author_id ?? "") }))
    .filter((album) => accepted.has(album.authorId) && !hidden.has(album.authorId));
  const decisions: AgreementDecision[] = [];
  const authorIds = [...new Set(albums.map((album) => album.authorId))];
  for (let index = 0; index < authorIds.length; index += 100) {
    const { data, error } = await db.from("business_content_admissions").select("author_id, practice_id, direction_key, allowed").in("author_id", authorIds.slice(index, index + 100));
    if (error) throw new Error("unavailable");
    decisions.push(...((data ?? []) as AgreementDecision[]));
  }
  const albumIds = albums.map((album) => album.id);
  for (let index = 0; index < albumIds.length; index += 100) {
    const { data, error } = await db.from("business_content_admissions").select("author_id, practice_id, direction_key, allowed").in("practice_id", albumIds.slice(index, index + 100));
    if (error) throw new Error("unavailable");
    decisions.push(...((data ?? []) as AgreementDecision[]));
  }
  const focus = new Set(focusIds);
  const listed = albums.map((album) => {
    const sectors: Record<string, SectorDecision> = {};
    for (const direction of directions) {
      const artist = decisions.find((row) => row.author_id === album.authorId && row.direction_key === direction.key);
      const own = decisions.find((row) => row.practice_id === album.id && row.direction_key === direction.key);
      sectors[direction.key] = { artist: artist?.allowed ?? null, album: own?.allowed ?? null };
    }
    const admitted = directions.some((direction) => {
      const state = sectors[direction.key];
      return state.album === true || (state.album == null && state.artist === true);
    });
    return { id: album.id, title: album.title, authorId: album.authorId, authorName: names.get(album.authorId) ?? "", sectors, admitted };
  }).filter((album) => focus.has(album.id) || !album.admitted);
  listed.sort((left, right) => Number(left.admitted) - Number(right.admitted) || (left.title < right.title ? -1 : left.title > right.title ? 1 : left.id < right.id ? -1 : 1));
  return { directions, albums: listed.slice(0, 80) };
}

export async function loadAgreementSoundQueue(
  db: SupabaseClient,
  filter: { status?: string; artist?: string; album?: string; space?: string; page?: number },
): Promise<ReturnType<typeof restrictSoundQueueToAgreement>> {
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
  const accepted = await verifiedRightsAuthorIds();
  const hidden = await hiddenArtistIds();
  return restrictSoundQueueToAgreement(rows, accepted, { ...filter, hiddenAuthorIds: hidden });
}
