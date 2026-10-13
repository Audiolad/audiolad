"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchSpaManifestRaw, isUuid, loadSpaPilotContext, signSpaTrack, type SpaSignedTrack } from "@/lib/business-app/spa-pilot";
import { isLogEvent, type SpaLogEvent } from "@/lib/business-app/spa-player-core";

export type SpaActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function refreshSpaManifest(): Promise<SpaActionResult<unknown>> {
  const ctx = await loadSpaPilotContext();
  if (!ctx) return { ok: false, reason: "no_access" };
  try {
    return { ok: true, data: await fetchSpaManifestRaw(ctx) };
  } catch {
    return { ok: false, reason: "manifest_failed" };
  }
}

const SIGN_ERRORS: Record<string, string> = {
  business_spa_track_not_in_manifest: "not_in_manifest",
  business_spa_offline_not_allowed: "offline_not_allowed",
  business_spa_track_expired: "expired",
};

export async function getSpaTrackUrl(
  audioItemId: string,
  purpose: "stream" | "offline" = "stream",
): Promise<SpaActionResult<SpaSignedTrack>> {
  if (!isUuid(audioItemId) || (purpose !== "stream" && purpose !== "offline")) return { ok: false, reason: "invalid_request" };
  const ctx = await loadSpaPilotContext();
  if (!ctx) return { ok: false, reason: "no_access" };
  try {
    return { ok: true, data: await signSpaTrack(ctx, audioItemId, purpose) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, reason: SIGN_ERRORS[msg] ?? "sign_failed" };
  }
}

/** Uploads queued play events (incl. offline ones). Idempotent on (player_id, client_event_id). */
export async function syncSpaPlaybackLog(events: unknown): Promise<SpaActionResult<string[]>> {
  if (!Array.isArray(events) || events.length > 500) return { ok: false, reason: "invalid_request" };
  const valid = events.filter(isLogEvent) as SpaLogEvent[];
  const ctx = await loadSpaPilotContext();
  if (!ctx) return { ok: false, reason: "no_access" };
  if (valid.length === 0) return { ok: true, data: [] };
  const now = Date.now();
  const rows = valid
    // Client clocks are untrusted: no future events, nothing older than 8 days (7-day cache + margin).
    .filter((e) => Date.parse(e.started_at) <= now + 60_000 && Date.parse(e.started_at) >= now - 8 * 86_400_000)
    .map((e) => ({
      // Player/zone come from the event itself (bound at creation), never the current
      // assignment, so a retry after reassignment keeps the same dedupe key. The DB
      // trigger still verifies org scope and the assignment at started_at.
      player_id: e.player_id,
      zone_id: e.zone_id,
      organization_id: ctx.organizationId,
      program_id: ctx.programId,
      audio_item_id: e.audio_item_id,
      started_at: e.started_at,
      ended_at: e.ended_at,
      played_ms: Math.round(e.played_ms),
      event: e.event,
      client_event_id: e.client_event_id,
      offline: e.offline,
    }));
  const supabase = await createClient();
  if (rows.length > 0) {
    const { error } = await supabase
      .from("business_playback_log")
      .upsert(rows, { onConflict: "player_id,client_event_id", ignoreDuplicates: true });
    if (error) {
      // One bad row (e.g. player not assigned at started_at) must not jam the queue:
      // retry row by row; scope/validation rejects are dropped (acked), transient errors kept.
      const kept = new Set<string>();
      for (const row of rows) {
        const { error: rowError } = await supabase
          .from("business_playback_log")
          .upsert([row], { onConflict: "player_id,client_event_id", ignoreDuplicates: true });
        if (rowError && !["23514", "23503", "42501", "22023"].includes(rowError.code ?? "")) kept.add(row.client_event_id);
      }
      if (kept.size === rows.length) return { ok: false, reason: "sync_failed" };
      return { ok: true, data: valid.map((e) => e.client_event_id).filter((id) => !kept.has(id)) };
    }
  }
  // Dropped (out-of-window/invalid) events are acknowledged too so the queue cannot jam.
  return { ok: true, data: valid.map((e) => e.client_event_id) };
}
