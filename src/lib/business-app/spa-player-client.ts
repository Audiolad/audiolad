import type { SpaLiveReport } from "@/lib/business-app/spa-live-report";

/**
 * c02fe282 stable-report: browser side of the /spa player. Uses stable route handlers (not server
 * actions, whose IDs change per build) so an open tab keeps working across deploys.
 */

type Fetch = typeof fetch;
type Result<T> = { ok: true; data: T } | { ok: false; reason: string };

const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store" } as const;

export type SpaReportPayload =
  | { kind: "heartbeat"; deviceSecret: string }
  | { kind: "playback"; deviceSecret: string; report: SpaLiveReport };

export async function postSpaReport(payload: SpaReportPayload, f: Fetch = fetch): Promise<Result<null>> {
  const res = await f("/api/business/player/report", { ...JSON_POST, body: JSON.stringify(payload) });
  return (await res.json().catch(() => ({ ok: false, reason: "report_failed" }))) as Result<null>;
}

export async function fetchSpaTrackUrl(audioItemId: string, f: Fetch = fetch): Promise<Result<{ url: string }>> {
  try {
    const res = await f("/api/business/player/track-url", { ...JSON_POST, body: JSON.stringify({ audioItemId }) });
    const json = (await res.json()) as Result<{ url: string }>;
    return json && typeof json === "object" && "ok" in json ? json : { ok: false, reason: "network" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function fetchSpaManifest(f: Fetch = fetch): Promise<Result<unknown>> {
  const res = await f("/api/business/player/manifest", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) return { ok: false, reason: "manifest_failed" };
  return (await res.json()) as Result<unknown>;
}

/**
 * Detects a newer deploy (via /api/health/build) and calls onNewBuild once. Never reloads:
 * the UI only shows a gentle hint so music is not interrupted.
 */
export function watchSpaBuild(
  onNewBuild: () => void,
  opts: { f?: Fetch; setInterval?: (fn: () => void, ms: number) => unknown; clearInterval?: (t: unknown) => void; intervalMs?: number } = {},
): () => void {
  const f = opts.f ?? fetch;
  const si = opts.setInterval ?? ((fn, ms) => window.setInterval(fn, ms));
  const ci = opts.clearInterval ?? ((t) => window.clearInterval(t as number));
  let initial: string | null | undefined;
  let done = false;
  const check = async () => {
    if (done) return;
    try {
      const res = await f("/api/health/build", { cache: "no-store" });
      if (!res.ok) return;
      const commit = ((await res.json()) as { deployCommit?: unknown }).deployCommit;
      if (typeof commit !== "string" || !commit) return;
      if (initial === undefined) initial = commit;
      else if (commit !== initial) { done = true; onNewBuild(); }
    } catch { /* offline: try later */ }
  };
  void check();
  const t = si(() => void check(), opts.intervalMs ?? 5 * 60_000);
  return () => { done = true; ci(t); };
}
