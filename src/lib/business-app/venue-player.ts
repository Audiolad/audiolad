/**
 * Venue Player runtime helpers (P0-03).
 * Pure / browser-safe — no server-only imports.
 */

export const VENUE_PLAYER_APP_VERSION = "venue-player-v0";
export const VENUE_PLAYER_CREDENTIAL_STORAGE_KEY =
  "audiolad-business-venue-player-credential";
export const VENUE_PLAYER_DEFAULT_HEARTBEAT_SECONDS = 30;

/** Canonical machine credential: 64 lowercase hex (matches SQL). */
export const VENUE_PLAYER_CREDENTIAL_RE = /^[0-9a-f]{64}$/;

export function isVenuePlayerCredential(value: string): boolean {
  return VENUE_PLAYER_CREDENTIAL_RE.test(value);
}

/**
 * Pilot playback source for slice v0 (UNKNOWN-safe).
 * Tiny silent-ish sine WAV (PCM 16-bit mono 8kHz ~0.5s) as data URI —
 * proves HTMLAudioElement plays without rights/catalog claims.
 * Not marked eligible/licensed. Full catalog = P0-05/06 after HG.
 */
export type VenuePlayerPilotTrack = {
  id: string;
  title: string;
  program: string;
  description: string;
  src: string;
};

let cachedPilot: VenuePlayerPilotTrack | null = null;

export function getVenuePlayerPilotTrack(): VenuePlayerPilotTrack {
  if (!cachedPilot) {
    cachedPilot = {
      id: "pilot-tone-v0",
      title: "Pilot tone (slice v0)",
      program: "Venue Player runtime",
      description: "Технический пилот-тон. Не eligible-каталог.",
      src: buildPilotToneDataUri(),
    };
  }
  return cachedPilot;
}

function buildPilotToneDataUri(): string {
  // Minimal WAV: 8000 Hz, mono, 16-bit, 0.75s of a soft square-ish tone.
  const sampleRate = 8000;
  const durationSec = 0.75;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const freq = 440;
  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.min(1, (durationSec - t) * 8);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.25 * envelope;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  // btoa available in browsers; in Node unit tests we use Buffer.
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return `data:audio/wav;base64,${b64}`;
}

export function resolveHeartbeatIntervalSeconds(
  recommended: unknown,
): number {
  const n = typeof recommended === "number" ? recommended : Number(recommended);
  if (!Number.isFinite(n) || n < 5 || n > 300) {
    return VENUE_PLAYER_DEFAULT_HEARTBEAT_SECONDS;
  }
  return Math.floor(n);
}

/** PoP sample cadence while playing (media-time evidence). */
export const VENUE_PLAYER_POP_SAMPLE_INTERVAL_MS = 5_000;

/**
 * Slice v0 allowlist: one published music audio_item for PoP ledger bind.
 * Evidence only — not Rights Eligibility / not "licensed for venue".
 * Full catalog freeze = P0-06 after HG-3/4.
 */
export const VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID =
  "157f8644-4ad1-4bea-9de0-d44f911ae009";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVenuePlayerUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function createVenuePlayerUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Node <19 / odd runtimes — still valid v4-shaped id for unit/smoke.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type BusinessPopPhase =
  | "advance"
  | "seek"
  | "pause"
  | "ended"
  | "track_change";

export type BusinessPopHeartbeatArgs = {
  p_credential: string;
  p_client_event_id: string;
  p_playback_session_id: string;
  p_sample_seq: number;
  p_audio_item_id: string;
  p_position_ms: number;
  p_client_media_delta_ms: number | null;
  p_playback_rate: number | null;
  p_phase: BusinessPopPhase;
};

/**
 * Build args for public.apply_business_playback_usage_heartbeat.
 * Spatial attribution is server-derived from credential → assignment.
 */
export function buildBusinessPopHeartbeatArgs(input: {
  credential: string;
  clientEventId: string;
  playbackSessionId: string;
  sampleSeq: number;
  audioItemId?: string;
  positionMs: number;
  priorPositionMs?: number | null;
  playbackRate?: number | null;
  phase?: BusinessPopPhase;
}): BusinessPopHeartbeatArgs {
  if (!isVenuePlayerCredential(input.credential)) {
    throw new Error("invalid_player_credential");
  }
  if (!isVenuePlayerUuid(input.clientEventId)) {
    throw new Error("invalid_client_event_id");
  }
  if (!isVenuePlayerUuid(input.playbackSessionId)) {
    throw new Error("invalid_playback_session_id");
  }
  if (!Number.isInteger(input.sampleSeq) || input.sampleSeq < 1) {
    throw new Error("invalid_sample_seq");
  }
  const audioItemId = (
    input.audioItemId ?? VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID
  ).trim();
  if (!isVenuePlayerUuid(audioItemId)) {
    throw new Error("invalid_audio_item_id");
  }
  const positionMs = Math.max(0, Math.floor(input.positionMs));
  const prior =
    typeof input.priorPositionMs === "number" &&
    Number.isFinite(input.priorPositionMs)
      ? Math.max(0, Math.floor(input.priorPositionMs))
      : null;
  const mediaDelta =
    prior === null ? null : Math.max(0, positionMs - prior);
  const phase = input.phase ?? "advance";
  const rate =
    typeof input.playbackRate === "number" &&
    Number.isFinite(input.playbackRate) &&
    input.playbackRate > 0 &&
    input.playbackRate <= 4
      ? input.playbackRate
      : null;

  return {
    p_credential: input.credential,
    p_client_event_id: input.clientEventId,
    p_playback_session_id: input.playbackSessionId,
    p_sample_seq: input.sampleSeq,
    p_audio_item_id: audioItemId,
    p_position_ms: positionMs,
    p_client_media_delta_ms: mediaDelta,
    p_playback_rate: rate,
    p_phase: phase,
  };
}
