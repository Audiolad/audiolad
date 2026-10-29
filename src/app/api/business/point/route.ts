import { NextResponse } from "next/server";

import { CAFE_DAYPART_HOURS_DEFAULT, CAFE_QUEUE_DEFAULT_PREFS } from "@/lib/business-app/cafe-queue/prefs";
import { GUEST_COFFEE_DEFAULT_PROFILE } from "@/lib/business-app/guest-coffee/catalog";
import { locationSoundFromRow, locationSoundRpcArgs, type LocationSoundDraft } from "@/lib/business-app/location-sound-settings";
import { pointMusicAllowed, POINT_MUSIC_FORBIDDEN, soundDraftFromBody } from "@/lib/business-app/point-sound";
import { isPointCommandId, isPointCommandType } from "@/lib/business-app/point-commands";
import { isPointToken, BUSINESS_POINT_COOKIE, normalizePointCode, pointCookieOptions } from "@/lib/business-app/point-session";
import { pointJoinResult } from "@/lib/business-app/point-join";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { isSpaLiveReport } from "@/lib/business-app/spa-live-report";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

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
    if (text.length > 4096) return json({ ok: false, reason: "invalid_request" }, 413);
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
    return json({ ok: true, code: payload.code, expiresAt: payload.expires_at });
  }

  if (body.action === "join") {
    // Every attempt, even a malformed one, goes to the database limiter with the client IP.
    // The redeem function is server-only, so the anon key cannot skip the limits.
    const code = typeof body.code === "string" ? (normalizePointCode(body.code) ?? body.code.slice(0, 16)) : "";
    let data: unknown = null;
    let failed = false;
    try {
      const admin = createServiceRoleClient();
      const result = await admin.rpc("redeem_business_point_pairing", {
        p_code: code,
        p_client_key: getTrustedClientIp(request),
      });
      data = result.data;
      failed = Boolean(result.error);
    } catch {
      failed = true;
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

  if (body.action === "rename") {
    const locationId = typeof body.locationId === "string" ? body.locationId : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!locationId || name.length < 1 || name.length > 120) {
      return json({ ok: false, error: "Не удалось сохранить название." }, 400);
    }
    const { data, error } = await supabase.rpc("rename_business_location", {
      p_location_id: locationId,
      p_name: name,
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      return json({ ok: false, error: "Не удалось сохранить название. Попробуйте ещё раз." });
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
      const commands = data.filter(
        (row): row is { id: string; type: "pause" | "resume" | "next_track"; created_at: string } =>
          !!row && isPointCommandId((row as { id?: unknown }).id) && isPointCommandType((row as { type?: unknown }).type),
      );
      return json({ ok: true, commands });
    }
    if (!isPointCommandId(body.id)) return json({ ok: false, reason: "invalid_request" }, 400);
    const { data, error } = await supabase.rpc("ack_business_point_command", {
      p_token: token,
      p_command_id: body.id,
      p_result: "applied",
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
