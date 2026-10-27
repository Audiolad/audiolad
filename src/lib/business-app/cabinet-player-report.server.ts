import "server-only";

import { parseBusinessEligibilityPayload } from "@/lib/business-app/eligibility";
import {
  cabinetByteaHex,
  cabinetDeviceClaimOpen,
  cabinetDeviceSecretBytea,
  cabinetDeviceSecretHex,
  parseCabinetReportBody,
} from "@/lib/business-app/cabinet-player-report";
import type { SpaReportResult } from "@/lib/business-app/spa-player-report";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const PROGRAM_NAME = "Музыка кабинета";
const PLAYER_NAME = "Плеер кабинета";

type UserClient = Awaited<ReturnType<typeof createClient>>;

const playerByOrg = new Map<string, string>();
const playerInflight = new Map<string, Promise<string | null>>();

type HealthRow = { player_id?: string; location_id?: string | null };

/**
 * One active player for the owner's organization, assigned to the venue zone.
 * Uses the existing owner RPCs (create + assign). Concurrent heartbeats in this
 * process share one in-flight create.
 */
async function ensureCabinetPlayer(
  supabase: UserClient,
  organizationId: string,
  locationId: string,
  zoneId: string,
): Promise<string | null> {
  const cached = playerByOrg.get(organizationId);
  if (cached) return cached;
  const pending = playerInflight.get(organizationId);
  if (pending) return pending;
  const job = (async () => {
    const { data, error } = await supabase.rpc("get_business_player_health", {
      p_organization_id: organizationId,
    });
    if (error) return null;
    const rows = (Array.isArray(data) ? data : []) as HealthRow[];
    const onLocation = rows.find((row) => row.player_id && row.location_id === locationId);
    const any = rows.find((row) => row.player_id);
    let playerId = onLocation?.player_id ?? any?.player_id ?? null;
    if (!playerId) {
      const created = await supabase.rpc("create_business_player", {
        p_organization_id: organizationId,
        p_display_name: PLAYER_NAME,
      });
      const payload = created.data as { ok?: boolean; player_id?: string } | null;
      if (created.error || !payload?.ok || !payload.player_id) return null;
      playerId = payload.player_id;
    }
    if (!onLocation || onLocation.player_id !== playerId) {
      const assigned = await supabase.rpc("assign_business_player_to_zone", {
        p_player_id: playerId,
        p_zone_id: zoneId,
      });
      const payload = assigned.data as { ok?: boolean } | null;
      if (assigned.error || !payload?.ok) return null;
    }
    playerByOrg.set(organizationId, playerId);
    return playerId;
  })().finally(() => {
    playerInflight.delete(organizationId);
  });
  playerInflight.set(organizationId, job);
  return job;
}

async function ensureCafeProgramItem(
  service: ReturnType<typeof createServiceRoleClient>,
  organizationId: string,
  userId: string,
  audioItemId: string,
): Promise<void> {
  const existing = await service
    .from("business_programs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("kind", "cafe")
    .eq("name", PROGRAM_NAME)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  let programId = existing.data?.id as string | undefined;
  if (!programId) {
    const inserted = await service
      .from("business_programs")
      .insert({
        organization_id: organizationId,
        name: PROGRAM_NAME,
        kind: "cafe",
        status: "active",
        created_by: userId,
      })
      .select("id")
      .maybeSingle();
    programId = inserted.data?.id as string | undefined;
    if (!programId) {
      console.error("cabinet_program_unavailable");
      return;
    }
  }
  const already = await service
    .from("business_program_items")
    .select("id")
    .eq("program_id", programId)
    .eq("audio_item_id", audioItemId)
    .is("excluded_at", null)
    .limit(1)
    .maybeSingle();
  if (already.data?.id) return;
  const inserted = await service.from("business_program_items").insert({
    program_id: programId,
    audio_item_id: audioItemId,
    position: 1,
    added_by: userId,
  });
  if (inserted.error && inserted.error.code !== "23505") {
    console.error("cabinet_program_item_skipped");
  }
}

/**
 * The music the cabinet plays IS the venue player.
 * Writes the existing heartbeat, runtime and playback tables. No new migration.
 * A track is attached only when resolve_business_track_eligibility says ELIGIBLE,
 * and one cafe program item is added so the owner live-state title SQL can see it.
 */
export async function handleCabinetPlayerReport(body: unknown): Promise<SpaReportResult> {
  const parsed = parseCabinetReportBody(body);
  if (!parsed) return { ok: false, reason: "invalid_request" };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "no_access" };

    const { data: membership, error: membershipError } = await supabase
      .from("business_organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership?.organization_id) return { ok: false, reason: "no_access" };
    const organizationId = membership.organization_id as string;

    const { data: location, error: locationError } = await supabase
      .from("business_locations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (locationError || !location?.id) return { ok: false, reason: "no_access" };

    const { data: zone, error: zoneError } = await supabase
      .from("business_zones")
      .select("id")
      .eq("location_id", location.id)
      .eq("status", "active")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (zoneError || !zone?.id) return { ok: false, reason: "no_access" };

    const playerId = await ensureCabinetPlayer(supabase, organizationId, location.id, zone.id);
    if (!playerId) return { ok: false, reason: "report_failed" };

    const service = createServiceRoleClient();
    const now = new Date().toISOString();
    const nowMs = Date.now();
    const nextHex = cabinetDeviceSecretHex(parsed.deviceSecret);
    const { data: claim } = await service
      .from("business_player_device_heartbeat")
      .select("device_session_hash, last_seen_at")
      .eq("player_id", playerId)
      .maybeSingle();
    const existingHex = cabinetByteaHex(claim?.device_session_hash);
    const lastSeenMs = claim?.last_seen_at ? Date.parse(String(claim.last_seen_at)) : null;
    if (!cabinetDeviceClaimOpen(existingHex, nextHex, lastSeenMs, nowMs)) {
      return { ok: false, reason: "report_failed" };
    }
    const bytea = cabinetDeviceSecretBytea(parsed.deviceSecret);
    if (claim) {
      const updated = await service
        .from("business_player_device_heartbeat")
        .update({
          organization_id: organizationId,
          device_session_hash: bytea,
          last_seen_at: now,
        })
        .eq("player_id", playerId);
      if (updated.error) return { ok: false, reason: "report_failed" };
    } else {
      const inserted = await service.from("business_player_device_heartbeat").insert({
        player_id: playerId,
        organization_id: organizationId,
        device_session_hash: bytea,
        claimed_at: now,
        last_seen_at: now,
      });
      if (inserted.error) return { ok: false, reason: "report_failed" };
    }
    const runtime = await service
      .from("business_player_runtime")
      .update({ last_heartbeat_at: now })
      .eq("player_id", playerId);
    if (runtime.error) return { ok: false, reason: "report_failed" };

    if (parsed.kind === "heartbeat") return { ok: true, data: null };

    const report = parsed.report;
    let audioItemId = report.audioItemId;
    let confirmed = report.playingConfirmed;
    if (audioItemId) {
      const { data, error } = await service.rpc("resolve_business_track_eligibility", {
        p_audio_item_id: audioItemId,
        p_location_id: location.id,
        p_zone_id: null,
        p_use_type: "business_background_playback",
      });
      const decision = error ? "UNKNOWN" : parseBusinessEligibilityPayload(data, audioItemId)?.decision;
      if (decision !== "ELIGIBLE") {
        audioItemId = null;
        confirmed = false;
      } else {
        await ensureCafeProgramItem(service, organizationId, user.id, audioItemId);
      }
    }
    const playback = await service.from("business_player_playback_state").upsert({
      player_id: playerId,
      organization_id: organizationId,
      playback_state: report.state,
      audio_item_id: audioItemId,
      error_code: report.errorCode,
      state_changed_at: now,
      reported_at: now,
      playing_confirmed_at: confirmed ? now : null,
    }, { onConflict: "player_id" });
    if (playback.error) return { ok: false, reason: "report_failed" };

    if (confirmed && audioItemId) {
      const since = new Date(nowMs - 5 * 60 * 1000).toISOString();
      const { data: hist } = await service
        .from("business_player_listening_history")
        .select("id")
        .eq("player_id", playerId)
        .eq("audio_item_id", audioItemId)
        .gte("last_confirmed_at", since)
        .order("last_confirmed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hist?.id) {
        await service.from("business_player_listening_history").update({ last_confirmed_at: now }).eq("id", hist.id);
      } else {
        await service.from("business_player_listening_history").insert({
          player_id: playerId,
          organization_id: organizationId,
          location_id: location.id,
          audio_item_id: audioItemId,
          first_confirmed_at: now,
          last_confirmed_at: now,
        });
      }
    }
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: "report_failed" };
  }
}
