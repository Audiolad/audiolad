"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchSpaManifestRaw, isUuid, loadSpaPilotContext, signSpaTrack } from "@/lib/business-app/spa-pilot";
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

export async function getSpaTrackUrl(audioItemId: string): Promise<SpaActionResult<string>> {
  if (!isUuid(audioItemId)) return { ok: false, reason: "invalid_request" };
  const ctx = await loadSpaPilotContext();
  if (!ctx) return { ok: false, reason: "no_access" };
  try {
    return { ok: true, data: await signSpaTrack(ctx, audioItemId) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, reason: msg === "business_spa_track_not_in_manifest" ? "not_in_manifest" : "sign_failed" };
  }
}

/** Uploads queued play events (incl. offline ones). Idempotent on (player_id, client_event_id). */
export async function syncSpaPlaybackLog(events: unknown): Promise<SpaActionResult<string[]>> {
  if (!Array.isArray(events) || events.length > 500) return { ok: false, reason: "invalid_request" };
  const valid = events.filter(isLogEvent) as SpaLogEvent[];
  const ctx = await loadSpaPilotContext();
  if (!ctx) return { ok: false, reason: "no_access" };
  if (!ctx.playerId || !ctx.zoneId) return { ok: false, reason: "no_player" };
  if (valid.length === 0) return { ok: true, data: [] };
  const now = Date.now();
  const rows = valid
    // Client clocks are untrusted: no future events, nothing older than 8 days (7-day cache + margin).
    .filter((e) => Date.parse(e.started_at) <= now + 60_000 && Date.parse(e.started_at) >= now - 8 * 86_400_000)
    .map((e) => ({
      player_id: ctx.playerId,
      zone_id: ctx.zoneId,
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
    if (error) return { ok: false, reason: "sync_failed" };
  }
  // Dropped (out-of-window/invalid) events are acknowledged too so the queue cannot jam.
  return { ok: true, data: valid.map((e) => e.client_event_id) };
}
