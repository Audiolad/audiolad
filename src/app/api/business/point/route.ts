import { NextResponse } from "next/server";

import { isPointCommandId, isPointCommandType } from "@/lib/business-app/point-commands";
import { isPointToken, BUSINESS_POINT_COOKIE, normalizePointCode, pointCookieOptions } from "@/lib/business-app/point-session";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { isSpaLiveReport } from "@/lib/business-app/spa-live-report";
import { createClient } from "@/lib/supabase/server";

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
    if (error || !data || (data as { ok?: boolean }).ok !== true) {
      return json({ ok: false, error: "Не удалось создать код. Попробуйте ещё раз." });
    }
    const payload = data as { code?: string; expires_at?: string };
    return json({ ok: true, code: payload.code, expiresAt: payload.expires_at });
  }

  if (body.action === "join") {
    const code = typeof body.code === "string" ? normalizePointCode(body.code) : null;
    if (!code) return json({ ok: false, error: "Код не подошёл. Запросите новый." });
    const { data, error } = await supabase.rpc("consume_business_point_pairing", { p_code: code });
    const payload = data as { ok?: boolean; token?: string; location_name?: string } | null;
    if (error || !payload?.ok || !isPointToken(payload.token)) {
      return json({ ok: false, error: "Код не подошёл. Запросите новый." });
    }
    return json(
      { ok: true, locationName: payload.location_name ?? "" },
      200,
      { token: payload.token, secure },
    );
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

  if (body.action === "commands" || body.action === "ack") {
    const jar = request.headers.get("cookie") ?? "";
    const token = readCookie(jar, BUSINESS_POINT_COOKIE);
    if (!isPointToken(token)) return json({ ok: false, reason: "no_access" });
    if (body.action === "commands") {
      const { data, error } = await supabase.rpc("list_business_point_commands", { p_token: token });
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
