import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SoundReviewRow } from "@/lib/business/track-sound-review";
import { restrictSoundQueueToAgreement } from "@/lib/business/track-sound-review";
import { authorIdsWithVerifiedRights, filterAgreementSubjects, type AgreementDecision, type AgreementSubject } from "@/lib/business-admission/agreement-list";

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
  const accepted = await verifiedRightsAuthorIds();
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
  const accepted = await verifiedRightsAuthorIds();
  return authorIds.every((id) => accepted.has(id));
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
  return restrictSoundQueueToAgreement(rows, accepted, filter);
}
