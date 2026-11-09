import type { HallNowPlayingReport } from "@/lib/business-app/hall-mirror";
import type { SpaLiveReport } from "@/lib/business-app/spa-live-report";

type Fetch = typeof fetch;
export type PointReportResult =
  | { ok: true; data: null; serverBuildId?: string | null }
  | { ok: false; reason: string };

const JSON_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "same-origin",
  cache: "no-store",
} as const;

export type CabinetReportPayload =
  | { kind: "heartbeat"; deviceSecret: string }
  | { kind: "playback"; deviceSecret: string; report: SpaLiveReport };

const DEVICE_KEY = "audiolad.cabinet.device-session";

/** Per-tab secret for the cabinet player. Separate from the /spa device key. */
export function getCabinetDeviceSecret(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  random: () => string,
): string {
  try {
    const existing = storage?.getItem(DEVICE_KEY);
    if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
  } catch {
    /* storage blocked */
  }
  const fresh = (random() + random()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  try {
    storage?.setItem(DEVICE_KEY, fresh);
  } catch {
    /* storage blocked */
  }
  return fresh;
}

/**
 * Same stable URL as the /spa player, with source "cabinet".
 * The route writes the venue player tables; it does not call the spa allowlist RPCs.
 */
export async function postPointReport(
  payload: ({ kind: "heartbeat" } | {
    kind: "playback";
    report: SpaLiveReport;
    sample?: { eventId: string; sessionId: string; seq: number; positionMs: number } | null;
    /** Owner mirror snapshot (hall-mirror.ts). */
    nowPlaying?: HallNowPlayingReport;
  }) & {
    /** Client build id (deploy commit / BUILD_ID) stored in business_player_runtime.app_version. */
    appVersion?: string | null;
  },
  f: Fetch = fetch,
): Promise<PointReportResult> {
  try {
    const body: Record<string, unknown> = { action: "report", ...payload };
    if (payload.appVersion == null || payload.appVersion === "") delete body.appVersion;
    const res = await f("/api/business/point", {
      ...JSON_POST,
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as PointReportResult | null;
    if (json && typeof json === "object" && "ok" in json) {
      if (json.ok === true) {
        const serverBuildId = typeof (json as { serverBuildId?: unknown }).serverBuildId === "string"
          ? (json as { serverBuildId: string }).serverBuildId
          : null;
        return { ok: true, data: null, serverBuildId };
      }
      return json;
    }
    return { ok: false, reason: "report_failed" };
  } catch {
    return { ok: false, reason: "report_failed" };
  }
}

export async function postCabinetReport(payload: CabinetReportPayload, f: Fetch = fetch): Promise<PointReportResult> {
  try {
    const res = await f("/api/business/player/report", {
      ...JSON_POST,
      body: JSON.stringify({ ...payload, source: "cabinet" }),
    });
    const json = (await res.json().catch(() => null)) as PointReportResult | null;
    if (json && typeof json === "object" && "ok" in json) return json;
    return { ok: false, reason: "report_failed" };
  } catch {
    return { ok: false, reason: "report_failed" };
  }
}
