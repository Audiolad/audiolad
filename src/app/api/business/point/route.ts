import { loadBusinessOwnerHomeSignals } from "@/lib/business-app/load-owner-home-signals";
import { createHash } from "node:crypto";

import { after, NextResponse } from "next/server";

import { CAFE_DAYPART_HOURS_DEFAULT, CAFE_QUEUE_DEFAULT_PREFS } from "@/lib/business-app/cafe-queue/prefs";
import { GUEST_COFFEE_DEFAULT_PROFILE } from "@/lib/business-app/guest-coffee/catalog";
import { locationSoundFromRow, locationSoundRpcArgs, type LocationSoundDraft } from "@/lib/business-app/location-sound-settings";
import { businessHallDeviceLocked, loadBusinessOwnerUnlockUntil } from "@/lib/business-app/cabinet-mode.server";
import { businessPointDeviceStatus } from "@/lib/business-app/point-session.server";
import { pointMusicAllowed, POINT_MUSIC_FORBIDDEN, pointSoundUpdate, soundDraftFromBody } from "@/lib/business-app/point-sound";
import { isClaimedPointCommand, isPointCommandId, isPointCommandType } from "@/lib/business-app/point-commands";
import { isPointToken, BUSINESS_POINT_COOKIE, normalizePointCode, pointCookieOptions } from "@/lib/business-app/point-session";
import { pointClientIpCollapsed, pointJoinResult } from "@/lib/business-app/point-join";
import { pointCodeSecondsLeft } from "@/lib/business-app/point-share";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { isSpaLiveReport } from "@/lib/business-app/spa-live-report";
import { isHallNowPlayingReport, type HallNowPlayingReport } from "@/lib/business-app/hall-mirror";
import { loadHallNowPlaying } from "@/lib/business-app/hall-now-playing.server";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { businessTrialActivityConfig } from "@/lib/business-trial-activity/config";
import { recordBusinessTrialPointListen } from "@/lib/business-trial-activity/record.server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Log the collapsed client IP once per server process, not on every attempt. */
let warnedCollapsedIp = false;

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Owner actions. The hall device without a fresh owner password gets 403 (cabinet-mode.ts). */
const OWNER_ACTIONS = new Set(["owner-state", "hall-now", "create", "revoke", "link", "permission", "enqueue"]);

/** Same hash as the database stores: sha256 of the token text (business_point_sessions.token_hash). */
function pointTokenHashHex(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Owner mirror snapshot of the hall: RPC first, service-role upsert as the fallback. Never throws. */
async function writeHallNowPlaying(
  supabase: Awaited<ReturnType<typeof createClient>>,
  token: string,
  audioItemId: string | null,
  nowPlaying: HallNowPlayingReport,
): Promise<void> {
  try {
    const { error: rpcError } = await supabase.rpc("report_business_point_now_playing", {
      p_token: token,
      p_audio_item_id: audioItemId,
      p_position_ms: nowPlaying.positionMs,
      p_duration_ms: nowPlaying.durationMs,
      p_queue: nowPlaying.queue,
      p_queue_ahead: nowPlaying.aheadCount ?? nowPlaying.queue.length,
    });
    if (!rpcError) return;
  } catch { /* fall through to the service-role write */ }
  try {
    const admin = createServiceRoleClient();
    const { data: session, error: sessionError } = await admin
      .from("business_point_sessions")
      .select("player_id, organization_id, location_id")
      .eq("token_hash", `\\x${pointTokenHashHex(token)}`)
      .is("revoked_at", null)
      .maybeSingle();
    if (sessionError || !session) return;
    const row = session as { player_id: string; organization_id: string; location_id: string };
    await admin.from("business_player_now_playing").upsert({
      player_id: row.player_id,
      organization_id: row.organization_id,
      location_id: row.location_id,
      audio_item_id: audioItemId,
      position_ms: nowPlaying.positionMs,
      duration_ms: nowPlaying.durationMs,
      queue_audio_item_ids: nowPlaying.queue,
      queue_ahead_count: nowPlaying.aheadCount ?? nowPlaying.queue.length,
      reported_at: new Date().toISOString(),
    }, { onConflict: "player_id" });
  } catch { /* best effort */ }
}

function json(body: unknown, status = 200, extra?: { token?: string; secure?: boolean }) {
  const response = NextResponse.json(body, { status, headers: NO_STORE });
  if (extra?.token) {
    response.cookies.set(BUSINESS_POINT_COOKIE, extra.token, pointCookieOptions(extra.secure === true));
  }
  return response;
}

/** Pairing, revoke, and venue playback reports. The token stays in the cookie. */
export async function POST(request: Request) {
  if (!isSameOriginJsonRequest(request.headers)) {
    return json({ ok: false, reason: "forbidden" }, 403);
  }
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 16384) return json({ ok: false, reason: "invalid_request" }, 413);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, reason: "invalid_request" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, reason: "invalid_request" }, 400);
  }

  const supabase = await createClient();
  const secure = new URL(request.url).protocol === "https:";

  if (typeof body.action === "string" && OWNER_ACTIONS.has(body.action) && (await businessHallDeviceLocked())) {
    return json({ ok: false, reason: "venue_device", error: "На устройстве в зале это делает владелец после ввода пароля." }, 403);
  }

  if (body.action === "disconnect-self") {
    // «Отключить это устройство»: closes only this browser's own device session, by its own cookie.
    // No account needed; the token never leaves the server and no other session is touched.
    // First the account session on this browser (this browser only, checked): if it stayed, the
    // browser would turn into the owner cabinet once the device cookie is gone.
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) return json({ ok: false, error: "Не удалось отключить устройство. Попробуйте ещё раз." });
    } catch {
      return json({ ok: false, error: "Не удалось отключить устройство. Попробуйте ещё раз." });
    }
    const token = readCookie(request.headers.get("cookie") ?? "", BUSINESS_POINT_COOKIE);
    if (isPointToken(token)) {
      try {
        const admin = createServiceRoleClient();
        const { error } = await admin
          .from("business_point_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("token_hash", `\\x${pointTokenHashHex(token)}`)
          .is("revoked_at", null);
        if (error) return json({ ok: false, error: "Не удалось отключить устройство. Попробуйте ещё раз." });
      } catch {
        return json({ ok: false, error: "Не удалось отключить устройство. Попробуйте ещё раз." });
      }
    }
    const response = json({ ok: true });
    response.cookies.set(BUSINESS_POINT_COOKIE, "", { ...pointCookieOptions(secure), maxAge: 0 });
    return response;
  }

  if (body.action === "forget-revoked") {
    // After the owner's fresh password on a browser whose device was revoked (for example their own
    // phone): drop the dead device cookie, so this browser is the owner cabinet again. Only a
    // definitely revoked cookie and only with a fresh password; an alive or unchecked one stays.
    if ((await loadBusinessOwnerUnlockUntil()) === null) return json({ ok: false, reason: "unauthorized" }, 401);
    if ((await businessPointDeviceStatus()) !== "revoked") return json({ ok: true, cleared: false });
    const response = json({ ok: true, cleared: true });
    response.cookies.set(BUSINESS_POINT_COOKIE, "", { ...pointCookieOptions(secure), maxAge: 0 });
    return response;
  }

  if (body.action === "create") {
    const locationId = typeof body.locationId === "string" ? body.locationId : "";
    const { data, error } = await supabase.rpc("create_business_point_pairing", { p_location_id: locationId });
    if (error?.message?.includes("too_many_open_codes")) {
      return json({ ok: false, error: "Слишком много новых кодов. Подождите 10 минут и попробуйте снова." });
    }
    if (error || !data || (data as { ok?: boolean }).ok !== true) {
      return json({ ok: false, error: "Не удалось создать код. Попробуйте ещё раз." });
    }
    const payload = data as { code?: string; expires_at?: string };
    // Seconds left by the server clock: the card counts down from them, not from the phone clock.
    return json({ ok: true, code: payload.code, expiresAt: payload.expires_at, expiresIn: pointCodeSecondsLeft(payload.expires_at, Date.now()) });
  }

  if (body.action === "join") {
    // Every attempt, even a malformed one, goes to the database limiter with the client IP.
    // The redeem function is server-only, so the anon key cannot skip the limits.
    const code = typeof body.code === "string" ? (normalizePointCode(body.code) ?? body.code.slice(0, 16)) : "";
    let data: unknown = null;
    let failed = false;
    const clientIp = getTrustedClientIp(request);
    if (pointClientIpCollapsed(clientIp) && !warnedCollapsedIp) {
      warnedCollapsedIp = true;
      console.warn(
        `[business-point] join sees client IP "${clientIp}": nginx passes no X-Real-IP / X-Forwarded-For, so all devices share one attempt limit`,
      );
    }
    try {
      const admin = createServiceRoleClient();
      const result = await admin.rpc("redeem_business_point_pairing", {
        p_code: code,
        p_client_key: clientIp,
      });
      data = result.data;
      failed = Boolean(result.error);
    } catch {
      failed = true;
    }
    if (!failed && (data as { burned?: unknown } | null)?.burned === true) {
      console.warn("[business-point] 30 wrong codes in 20 minutes: all open pairing codes were closed");
    }
    const outcome = pointJoinResult(failed ? null : data);
    if (outcome.ok) {
      return json({ ok: true, locationName: outcome.locationName }, 200, { token: outcome.token, secure });
    }
    return json({ ok: false, reason: outcome.reason, error: outcome.error }, outcome.status);
  }

  if (body.action === "revoke") {
    const locationId = typeof body.locationId === "string" ? body.locationId : "";
    const { data, error } = await supabase.rpc("revoke_business_point_sessions", { p_location_id: locationId });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      return json({ ok: false, error: "Не удалось отключить устройство. Попробуйте ещё раз." });
    }
    const response = json({ ok: true });
    response.cookies.set(BUSINESS_POINT_COOKIE, "", { ...pointCookieOptions(secure), maxAge: 0 });
    return response;
  }

  if (body.action === "link") {
    const locationId = typeof body.locationId === "string" ? body.locationId : "";
    const { data, error } = await supabase.rpc("get_business_point_link", { p_location_id: locationId });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      return json({ ok: false, error: "Не удалось проверить устройство." });
    }
    const payload = data as { linked?: boolean; last_seen_at?: string | null; player_code?: string | null };
    return json({
      ok: true,
      linked: payload.linked === true,
      lastSeenAt: payload.last_seen_at ?? null,
      playerCode: payload.player_code ?? null,
    });
  }

  if (body.action === "owner-state") {
    if (!isPointCommandId(body.locationId)) return json({ ok: false }, 400);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ ok: false }, 401);
    // The caller's RLS client checks the location before any service-role reads in the loader.
    const { data: location, error } = await supabase.from("business_locations")
      .select("id, organization_id").eq("id", body.locationId).eq("status", "active").maybeSingle();
    if (error || !location) return json({ ok: false }, 403);
    const signals = await loadBusinessOwnerHomeSignals({ organizationId: location.organization_id, locationId: location.id, userId: user.id });
    return json({ ok: true, locationId: location.id, signals });
  }

  if (body.action === "hall-now") {
    // Owner mirror (t1283u): what the live hall device plays, for «Музыка» and the hall view.
    if (!isPointCommandId(body.locationId)) return json({ ok: false }, 400);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ ok: false }, 401);
    const { data: location, error } = await supabase.from("business_locations")
      .select("id, organization_id").eq("id", body.locationId).eq("status", "active").maybeSingle();
    if (error || !location) return json({ ok: false }, 403);
    const hall = await loadHallNowPlaying({ organizationId: location.organization_id, locationId: location.id });
    return json({ ok: true, hall });
  }

  if (body.action === "permission") {
    const locationId = typeof body.locationId === "string" ? body.locationId : "";
    if (typeof body.allowed !== "boolean" || !locationId) {
      return json({ ok: false, error: "Не удалось сохранить разрешение." }, 400);
    }
    const { data: row } = await supabase
      .from("business_location_sound_settings")
      .select("location_id, character, direction, daypart_mode, energy_offset, morning_start, morning_end, day_start, day_end, evening_start, evening_end, point_can_edit_settings, settings_version")
      .eq("location_id", locationId)
      .maybeSingle();
    const parsed = locationSoundFromRow(row as Record<string, unknown> | null);
    const draft: LocationSoundDraft = parsed ?? {
      character: GUEST_COFFEE_DEFAULT_PROFILE.character,
      direction: GUEST_COFFEE_DEFAULT_PROFILE.direction,
      daypartMode: CAFE_QUEUE_DEFAULT_PREFS.daypartMode,
      energyOffset: CAFE_QUEUE_DEFAULT_PREFS.energyOffset,
      hours: CAFE_DAYPART_HOURS_DEFAULT,
    };
    const { data, error } = await supabase.rpc(
      "save_business_location_sound_settings",
      locationSoundRpcArgs(locationId, draft, body.allowed),
    );
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      return json({ ok: false, error: "Не удалось сохранить разрешение. Попробуйте ещё раз." });
    }
    return json({ ok: true });
  }

  if (body.action === "enqueue") {
    if (!isPointCommandId(body.id) || !isPointCommandType(body.type) || typeof body.locationId !== "string") {
      return json({ ok: false, error: "Не удалось отправить команду." }, 400);
    }
    const { data, error } = await supabase.rpc("enqueue_business_point_command", {
      p_id: body.id,
      p_location_id: body.locationId,
      p_type: body.type,
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      return json({ ok: false, error: "Не удалось отправить команду. Попробуйте ещё раз." });
    }
    return json({ ok: true, id: (data as { id?: string }).id ?? body.id });
  }

  if (body.action === "commands" || body.action === "ack" || body.action === "sound" || body.action === "sound-save" || body.action === "music-change") {
    const jar = request.headers.get("cookie") ?? "";
    const token = readCookie(jar, BUSINESS_POINT_COOKIE);
    if (!isPointToken(token)) return json({ ok: false, reason: "no_access" });
    if (body.action === "sound") {
      const { data, error } = await supabase.rpc("get_business_point_sound_settings", { p_token: token });
      if (error || !data || (data as { ok?: boolean }).ok !== true) return json({ ok: false, reason: "sound_failed" });
      return json(data);
    }
    if (body.action === "music-change") {
      const { data, error } = await supabase.rpc("get_business_point_sound_settings", { p_token: token });
      if (error || !(data as { ok?: boolean } | null)?.ok) return json({ ok: false, reason: "no_access" }, 403);
      if (!pointMusicAllowed(data)) return json({ ok: false, reason: "forbidden", error: POINT_MUSIC_FORBIDDEN }, 403);
      return json({ ok: true });
    }
    if (body.action === "sound-save") {
      const draft = soundDraftFromBody(body);
      const locationId = typeof body.locationId === "string" ? body.locationId : "";
      if (!draft || !locationId) return json({ ok: false, reason: "invalid_request" }, 400);
      const { data: sound, error: soundError } = await supabase.rpc("get_business_point_sound_settings", { p_token: token });
      const settings = sound as { ok?: boolean; location_id?: string; point_can_edit_settings?: boolean } | null;
      if (soundError || settings?.ok !== true || settings.location_id !== locationId) {
        return json({ ok: false, reason: "no_access" }, 403);
      }
      // The flag defaults to on. Owner commands are still claimed when it is off.
      // The save RPC also checks the flag under lock in case it changes here.
      if (settings.point_can_edit_settings === false) {
        return json({ ok: false, reason: "forbidden", error: POINT_MUSIC_FORBIDDEN }, 403);
      }
      // Day-time settings belong to the owner (cabinet-mode.ts «daypartSettings»): the hall device
      // keeps the saved daypart mode and hours whatever the request says.
      const current = pointSoundUpdate(sound);
      if (!current) return json({ ok: false, reason: "no_access" }, 403);
      draft.daypartMode = current.daypartMode;
      draft.hours = current.hours;
      const { data, error } = await supabase.rpc("save_business_point_sound_settings", {
        p_token: token,
        p_location_id: locationId,
        p_character: draft.character,
        p_direction: draft.direction,
        p_daypart_mode: draft.daypartMode,
        p_energy_offset: draft.energyOffset,
        p_morning_start: draft.hours.morning.start,
        p_morning_end: draft.hours.morning.end,
        p_day_start: draft.hours.day.start,
        p_day_end: draft.hours.day.end,
        p_evening_start: draft.hours.evening.start,
        p_evening_end: draft.hours.evening.end,
      });
      if (error?.message?.includes("point_settings_locked")) {
        return json({ ok: false, reason: "forbidden", error: POINT_MUSIC_FORBIDDEN }, 403);
      }
      if (error || !(data as { ok?: boolean } | null)?.ok) {
        return json({ ok: false, error: "Не удалось сохранить звучание. Попробуйте ещё раз." });
      }
      return json({ ok: true });
    }
    if (body.action === "commands") {
      const { data, error } = await supabase.rpc("claim_business_point_commands", { p_token: token });
      if (error || !Array.isArray(data)) return json({ ok: false, reason: "commands_failed" });
      const commands = data.filter(isClaimedPointCommand);
      return json({ ok: true, commands });
    }
    if (!isPointCommandId(body.id) || !isPointCommandId(body.claimId)) return json({ ok: false, reason: "invalid_request" }, 400);
    const { data, error } = await supabase.rpc("ack_business_point_command", {
      p_token: token,
      p_command_id: body.id,
      p_result: "applied",
      p_claim_id: body.claimId,
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      return json({ ok: false, reason: "ack_failed" });
    }
    return json({ ok: true });
  }

  if (body.action === "report") {
    const jar = request.headers.get("cookie") ?? "";
    const token = readCookie(jar, BUSINESS_POINT_COOKIE);
    if (!isPointToken(token)) return json({ ok: false, reason: "no_access" });
    const kind = body.kind === "playback" ? "playback" : body.kind === "heartbeat" ? "heartbeat" : null;
    if (!kind) return json({ ok: false, reason: "invalid_request" }, 400);
    const report = kind === "playback" && isSpaLiveReport(body.report) ? body.report : null;
    if (kind === "playback" && !report) return json({ ok: false, reason: "invalid_request" }, 400);
    const { error } = await supabase.rpc("report_business_point_player", {
      p_token: token,
      p_kind: kind,
      p_state: report?.state ?? null,
      p_audio_item_id: report?.audioItemId ?? null,
      p_playing_confirmed: report?.playingConfirmed ?? false,
      p_error_code: report?.errorCode ?? null,
    });
    // Owner mirror snapshot (position, upcoming queue). Best effort: a failed write never fails the
    // playback report itself. supabase-js does not throw on RPC errors, so the returned error is
    // checked; if the RPC is not reachable (PostgREST schema cache not reloaded after the migration,
    // t1284u: the table stayed empty), the same row is written with the service role by this
    // browser's own device session.
    if (!error && report && isHallNowPlayingReport(body.nowPlaying)) {
      await writeHallNowPlaying(supabase, token, report.audioItemId, body.nowPlaying);
    }
    if (!error && report?.playingConfirmed && report.audioItemId && body.sample && typeof body.sample === "object") {
      const sample = body.sample as Record<string, unknown>;
      if (!isPointCommandId(sample.eventId) || !isPointCommandId(sample.sessionId)
        || !Number.isSafeInteger(sample.seq) || Number(sample.seq) < 1
        || !Number.isSafeInteger(sample.positionMs) || Number(sample.positionMs) < 0) {
        return json({ ok: false, reason: "invalid_sample" }, 400);
      }
      const { error: usageError } = await supabase.rpc("apply_business_point_usage_sample", {
        p_token: token, p_client_event_id: sample.eventId, p_playback_session_id: sample.sessionId,
        p_sample_seq: sample.seq, p_audio_item_id: report.audioItemId, p_position_ms: sample.positionMs,
      });
      if (usageError) return json({ ok: false, reason: "usage_report_failed" });
    }
    // Gift-week minutes (flag OFF by default): only confirmed playback on a valid session.
    if (!error && report?.state === "playing" && report.playingConfirmed && businessTrialActivityConfig(process.env).enabled) {
      after(() => recordBusinessTrialPointListen(token));
    }
    return json(error ? { ok: false, reason: "report_failed" } : { ok: true, data: null });
  }

  return json({ ok: false, reason: "invalid_request" }, 400);
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(/; */)) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    if (part.slice(0, at).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return part.slice(at + 1).trim();
    }
  }
  return null;
}
