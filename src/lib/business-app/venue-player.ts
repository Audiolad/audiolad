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
