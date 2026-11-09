import type { CafeAdmissionAdapter } from "./pool";
import { restrictCafePool } from "./pool";
import { appendExcludedIds } from "./auto-topup";
import { parseCafeQueueRequest } from "./request";
import { rankCafeQueue, type CafeQueueTrack } from "./rank";
import type { CafeTrackSignals } from "./signals";

export type CafeQueueResult =
  | { ok: true; order: string[] }
  | { ok: false; reason: "invalid_request" | "no_access" | "unavailable" };

export type CafeQueueDeps = {
  access: () => Promise<"open" | "closed">;
  /** Cabinet tracks already allowed to play, in the current catalog order. */
  loadTracks: () => Promise<readonly CafeQueueTrack[] | null>;
  /** Passport signals for those ids only. A throw falls back to catalog order. */
  loadSignals: (audioItemIds: readonly string[]) => Promise<ReadonlyMap<string, CafeTrackSignals>>;
};

/**
 * Orders the admission pool. Closed access returns before any catalog or passport read.
 * The response is track ids only: no energy, tags, loudness, or stream URLs.
 */
export async function handleCafeQueue(
  body: unknown,
  deps: CafeQueueDeps,
  adapter?: CafeAdmissionAdapter<CafeQueueTrack>,
): Promise<CafeQueueResult> {
  const request = parseCafeQueueRequest(body);
  if (!request) return { ok: false, reason: "invalid_request" };
  if ((await deps.access()) !== "open") return { ok: false, reason: "no_access" };
  const cabinetTracks = await deps.loadTracks();
  if (!cabinetTracks) return { ok: false, reason: "unavailable" };
  const pool = adapter ? restrictCafePool(cabinetTracks, adapter) : restrictCafePool(cabinetTracks);
  let signals: ReadonlyMap<string, CafeTrackSignals> = new Map();
  try {
    signals = await deps.loadSignals(pool.map((track) => track.audioItemId));
  } catch {
    signals = new Map();
  }
  const boundaryAlbumKey = request.boundaryAudioItemId
    ? pool.find((track) => track.audioItemId === request.boundaryAudioItemId)?.albumKey ?? null
    : null;
  const exclude = request.excludeAudioItemIds ?? [];
  const excludeSet = new Set(exclude);
  const primary = excludeSet.size === 0 ? pool : pool.filter((track) => !excludeSet.has(track.audioItemId));
  const ordered = rankCafeQueue(primary, signals, { ...request, boundaryAlbumKey });
  const orderIds = appendExcludedIds(
    ordered.map((track) => track.audioItemId),
    exclude,
    pool.map((track) => track.audioItemId),
  );
  return { ok: true, order: orderIds };
}
