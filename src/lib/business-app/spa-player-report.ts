import { isSpaLiveReport } from "@/lib/business-app/spa-live-report";

/**
 * c02fe282 stable-report: /spa live reporting (heartbeat + playback) as a pure handler shared by
 * the stable route handler POST /api/business/player/report. Server actions are addressed by
 * build-specific IDs, so an already-open /spa tab got HTTP 404 on every report after each deploy;
 * a route handler URL survives deploys. Auth/ownership is unchanged: the player id always comes
 * from the server-side session context, never from the request body, and the SECURITY DEFINER
 * RPCs re-derive the caller's own player and refuse any other id.
 */

export const SPA_DEVICE_SECRET = /^[A-Za-z0-9_-]{32,128}$/;

export type SpaReportResult = { ok: true; data: null } | { ok: false; reason: string };

export type SpaReportDeps = {
  loadPlayerId: () => Promise<string | null>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
};

export type SpaReportBody =
  | { kind: "heartbeat"; deviceSecret: string }
  | { kind: "playback"; deviceSecret: string; report: unknown };

export function parseSpaReportBody(value: unknown): SpaReportBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const b = value as Record<string, unknown>;
  if (typeof b.deviceSecret !== "string" || !SPA_DEVICE_SECRET.test(b.deviceSecret)) return null;
  if (b.kind === "heartbeat") return { kind: "heartbeat", deviceSecret: b.deviceSecret };
  if (b.kind === "playback") return { kind: "playback", deviceSecret: b.deviceSecret, report: b.report };
  return null;
}

export async function handleSpaReport(body: unknown, deps: SpaReportDeps): Promise<SpaReportResult> {
  try {
    const parsed = parseSpaReportBody(body);
    if (!parsed) return { ok: false, reason: "invalid_request" };
    if (parsed.kind === "playback" && !isSpaLiveReport(parsed.report)) return { ok: false, reason: "invalid_request" };
    const playerId = await deps.loadPlayerId();
    if (!playerId) return { ok: false, reason: "no_access" };
    if (parsed.kind === "heartbeat") {
      const { error } = await deps.rpc("report_business_spa_player_heartbeat", {
        p_player_id: playerId,
        p_device_secret: parsed.deviceSecret,
      });
      return error ? { ok: false, reason: "report_failed" } : { ok: true, data: null };
    }
    const r = parsed.report as import("@/lib/business-app/spa-live-report").SpaLiveReport;
    const { error } = await deps.rpc("report_business_spa_player_playback", {
      p_player_id: playerId,
      p_device_secret: parsed.deviceSecret,
      p_state: r.state,
      p_audio_item_id: r.audioItemId,
      p_playing_confirmed: r.playingConfirmed,
      p_error_code: r.errorCode,
    });
    return error ? { ok: false, reason: "report_failed" } : { ok: true, data: null };
  } catch {
    return { ok: false, reason: "report_failed" };
  }
}

/**
 * Strict same-origin guard for cookie-authenticated JSON posts (CSRF). Browsers send
 * Sec-Fetch-Site; otherwise the Origin host must equal the request host.
 */
export function isSameOriginJsonRequest(headers: Headers): boolean {
  const ct = headers.get("content-type")?.toLowerCase() ?? "";
  if (!ct.startsWith("application/json")) return false;
  const site = headers.get("sec-fetch-site")?.toLowerCase();
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function spaReportHttpStatus(result: SpaReportResult): number {
  if (result.ok) return 200;
  if (result.reason === "invalid_request") return 400;
  if (result.reason === "no_access") return 403;
  return 502;
}

const SIGN_ERRORS: Record<string, string> = {
  business_spa_track_not_in_manifest: "not_in_manifest",
  business_spa_offline_not_allowed: "offline_not_allowed",
  business_spa_track_expired: "expired",
};

export type SpaTrackUrlDeps<C> = {
  loadContext: () => Promise<C | null>;
  sign: (ctx: C, audioItemId: string) => Promise<{ url: string } & Record<string, unknown>>;
};

/** Stream-only track signing (offline stays refused, as in the server action). */
export async function handleSpaTrackUrl<C>(body: unknown, deps: SpaTrackUrlDeps<C>):
  Promise<{ ok: true; data: { url: string } & Record<string, unknown> } | { ok: false; reason: string }> {
  const id = body && typeof body === "object" ? (body as Record<string, unknown>).audioItemId : undefined;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false, reason: "invalid_request" };
  }
  const ctx = await deps.loadContext();
  if (!ctx) return { ok: false, reason: "no_access" };
  try {
    return { ok: true, data: await deps.sign(ctx, id) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, reason: SIGN_ERRORS[msg] ?? "sign_failed" };
  }
}
