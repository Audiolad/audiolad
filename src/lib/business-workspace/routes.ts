const AUDIO_ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkspaceTrackUrlResult =
  | { ok: true; data: { url: string } }
  | { ok: false; reason: string };

export type WorkspaceTrackUrlDeps = {
  /** open = trial or paid player. Anything else refuses the URL before signing. */
  access: () => Promise<"open" | "closed">;
  allowedIds: () => Promise<readonly string[]>;
  sign: (audioItemId: string) => Promise<{ ok: true; url: string } | { ok: false; reason: string }>;
};

export function parseWorkspaceAudioItemId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { audioItemId?: unknown }).audioItemId;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return AUDIO_ITEM_ID.test(trimmed) ? trimmed : null;
}

/**
 * Stream URL for the workspace player.
 * Refuses when the gift/paid player is closed, and when the id is outside the
 * server-filtered admission ∩ ELIGIBLE list. Signing runs only after both gates.
 */
export async function handleWorkspaceTrackUrl(
  body: unknown,
  deps: WorkspaceTrackUrlDeps,
): Promise<WorkspaceTrackUrlResult> {
  const audioItemId = parseWorkspaceAudioItemId(body);
  if (!audioItemId) return { ok: false, reason: "invalid_request" };
  if ((await deps.access()) !== "open") return { ok: false, reason: "no_access" };
  const allowed = await deps.allowedIds();
  if (!allowed.includes(audioItemId)) return { ok: false, reason: "not_in_manifest" };
  const signed = await deps.sign(audioItemId);
  if (!signed.ok) return { ok: false, reason: signed.reason || "sign_failed" };
  return { ok: true, data: { url: signed.url } };
}

export type WorkspaceStateBody =
  | {
      kind: "playback";
      index: number;
      positionSec: number;
      volume: number;
      play: boolean;
    }
  | { kind: "offer_click" };

export function parseWorkspaceStateBody(body: unknown): WorkspaceStateBody | null {
  if (!body || typeof body !== "object") return null;
  const kind = (body as { kind?: unknown }).kind;
  if (kind === "offer_click") return { kind: "offer_click" };
  if (kind !== "playback") return null;
  const row = body as { index?: unknown; positionSec?: unknown; volume?: unknown; play?: unknown };
  if (typeof row.index !== "number" || typeof row.positionSec !== "number" || typeof row.volume !== "number") {
    return null;
  }
  if (!Number.isFinite(row.index) || !Number.isFinite(row.positionSec) || !Number.isFinite(row.volume)) return null;
  return {
    kind: "playback",
    index: row.index,
    positionSec: row.positionSec,
    volume: row.volume,
    play: row.play === true,
  };
}

export type WorkspaceStateDeps = {
  userId: () => Promise<string | null>;
  playerOpen: () => Promise<boolean>;
  savePlayback: (input: { index: number; positionSec: number; volume: number }) => Promise<void>;
  recordPlay: () => Promise<void>;
  recordOfferClick: () => Promise<void>;
};

export async function handleWorkspaceState(
  body: unknown,
  deps: WorkspaceStateDeps,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const parsed = parseWorkspaceStateBody(body);
  if (!parsed) return { ok: false, reason: "invalid_request" };
  const userId = await deps.userId();
  if (!userId) return { ok: false, reason: "no_access" };
  if (parsed.kind === "offer_click") {
    await deps.recordOfferClick();
    return { ok: true };
  }
  const open = await deps.playerOpen();
  if (!open) return { ok: false, reason: "no_access" };
  await deps.savePlayback({
    index: parsed.index,
    positionSec: parsed.positionSec,
    volume: parsed.volume,
  });
  if (parsed.play) await deps.recordPlay();
  return { ok: true };
}
