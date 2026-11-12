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
    // No answer at all (offline): the hall device keeps its usage sample for later (t1331u).
    return { ok: false, reason: "network" };
  }
}

/**
 * t1331u: one listening sample recorded while the hall was offline (hall-report-queue.ts). Never
 * touches the live state / heartbeat of the hall. `retry` only when the request got no answer.
 */
export async function postPointUsage(
  sample: { eventId: string; sessionId: string; seq: number; positionMs: number; audioItemId: string },
  f: Fetch = fetch,
): Promise<"sent" | "drop" | "retry"> {
  try {
    const res = await f("/api/business/point", {
      ...JSON_POST,
      body: JSON.stringify({ action: "report", kind: "usage", usage: { ...sample, offline: true } }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: unknown; reason?: unknown } | null;
    if (json?.ok === true) return "sent";
    // A gateway / server failure without our JSON: try again later; a refusal: drop it.
    if (!json || res.status >= 500) return "retry";
    return "drop";
  } catch {
    return "retry";
  }
}

/**
 * t1390u: hall device journal batch (hall-device-journal.ts) → business_player_device_events.
 * true: stored (or deliberately dropped by the server); false: try again later.
 */
export async function postPointEvents(
  events: readonly { k: string; at: number; d: Record<string, unknown> }[],
  appVersion: string | null,
  f: Fetch = fetch,
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = { action: "report", kind: "events", events };
    if (appVersion) body.appVersion = appVersion;
    const res = await f("/api/business/point", { ...JSON_POST, body: JSON.stringify(body), keepalive: true });
    if (res.status >= 500) return false;
    const json = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    // A refusal (400 / no session) will not get better with retries: drop the batch.
    return json !== null;
  } catch {
    return false;
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
