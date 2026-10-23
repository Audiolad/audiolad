import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { BUSINESS_VENUE_PROGRAM_KINDS } from "./venue-programs";
import { summarizeSpaPlayback, type SpaPlaybackLogRow, type SpaTrackMinutes } from "./spa-admin-report";

export type SpaAdminItem = {
  position: number;
  audioItemId: string;
  trackCode: string | null;
  /** Live title from audio_items (no copy). */
  title: string;
  excludedAt: string | null;
  excludedReason: string | null;
  minutes: SpaTrackMinutes | null;
};

export type SpaAdminProgram = {
  id: string;
  name: string;
  status: string;
  organizationId: string;
  organizationName: string | null;
  items: SpaAdminItem[];
  totalOnlineMinutes: number;
  totalOfflineMinutes: number;
};

type ItemRow = {
  position: number;
  audio_item_id: string;
  excluded_at: string | null;
  excluded_reason: string | null;
  audio_items: { title: string | null; music_track_code: string | null } | null;
};

export const SPA_ADMIN_LOG_PAGE = 1000;

/** All log rows of a program, paged (PostgREST caps a single response). */
async function loadAllPlaybackRows(programId: string): Promise<{ data: SpaPlaybackLogRow[]; error: unknown }> {
  const db = createServiceRoleClient();
  const rows: SpaPlaybackLogRow[] = [];
  for (let from = 0; ; from += SPA_ADMIN_LOG_PAGE) {
    const { data, error } = await db
      .from("business_playback_log")
      .select("audio_item_id, played_ms, offline, event, received_at")
      .eq("program_id", programId)
      .order("id", { ascending: true })
      .range(from, from + SPA_ADMIN_LOG_PAGE - 1);
    if (error) return { data: [], error };
    rows.push(...((data ?? []) as SpaPlaybackLogRow[]));
    if (!data || data.length < SPA_ADMIN_LOG_PAGE) return { data: rows, error: null };
  }
}

export async function loadSpaAdminPrograms(): Promise<SpaAdminProgram[]> {
  const db = createServiceRoleClient();
  const { data: programs, error } = await db
    .from("business_programs")
    .select("id, name, status, organization_id, business_organizations(name)")
    .in("kind", [...BUSINESS_VENUE_PROGRAM_KINDS])
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  if (error) throw new Error("business_spa_admin_load_failed");

  const result: SpaAdminProgram[] = [];
  for (const p of programs ?? []) {
    const [{ data: items, error: itemsError }, { data: logs, error: logsError }] = await Promise.all([
      db
        .from("business_program_items")
        .select("position, audio_item_id, excluded_at, excluded_reason, audio_items(title, music_track_code)")
        .eq("program_id", p.id)
        .order("excluded_at", { ascending: true, nullsFirst: true })
        .order("position", { ascending: true }),
      loadAllPlaybackRows(p.id),
    ]);
    if (itemsError || logsError) throw new Error("business_spa_admin_load_failed");
    const summary = summarizeSpaPlayback((logs ?? []) as SpaPlaybackLogRow[]);
    const org = p.business_organizations as unknown as { name: string | null } | null;
    result.push({
      id: p.id,
      name: p.name,
      status: p.status,
      organizationId: p.organization_id,
      organizationName: org?.name ?? null,
      items: ((items ?? []) as unknown as ItemRow[]).map((i) => ({
        position: i.position,
        audioItemId: i.audio_item_id,
        trackCode: i.audio_items?.music_track_code ?? null,
        title: i.audio_items?.title ?? "",
        excludedAt: i.excluded_at,
        excludedReason: i.excluded_reason,
        minutes: summary.byTrack.get(i.audio_item_id) ?? null,
      })),
      totalOnlineMinutes: summary.totalOnlineMinutes,
      totalOfflineMinutes: summary.totalOfflineMinutes,
    });
  }
  return result;
}

/**
 * Removes ONE track via business_spa_exclude_program_item: the program row is locked
 * and only that item changes, so concurrent removals can never re-activate each other.
 */
export async function excludeProgramTrack(programId: string, audioItemId: string, reason: string): Promise<boolean> {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc("business_spa_exclude_program_item", {
    p_program_id: programId,
    p_audio_item_id: audioItemId,
    p_reason: reason,
  });
  if (error) throw new Error("business_spa_admin_update_failed");
  return data === true;
}
