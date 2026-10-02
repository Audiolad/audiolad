import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  buildRunStoragePath,
  type MusicAnalyzerMime,
} from "./audio-file";
import {
  MUSIC_ANALYZER_MAX_UPLOAD_BYTES,
  MUSIC_ANALYZER_RUNS_BUCKET,
  MUSIC_ANALYZER_UPLOAD_TICKET_TTL_MS,
} from "./constants";

export type { MusicAnalyzerMime };
export {
  audioLooksLikeWav,
  buildRunStoragePath,
  displayFilename,
  normalizeAudioMime,
  safeAudioFilename,
  validateUploadDescriptor,
} from "./audio-file";

export type MusicAnalyzerUploadIntent = {
  v: 1;
  userId: string;
  runId: string;
  storagePath: string;
  byteSize: number;
  mime: MusicAnalyzerMime;
  filename: string;
  exp: number;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sealUploadTicket(intent: MusicAnalyzerUploadIntent, secret: string): string {
  const body = Buffer.from(JSON.stringify(intent), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function openUploadTicket(
  token: string,
  secret: string,
  nowMs: number,
): MusicAnalyzerUploadIntent | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const intent = parsed as Partial<MusicAnalyzerUploadIntent>;
  if (intent.v !== 1) return null;
  if (!intent.userId || !intent.runId || !intent.storagePath || !intent.filename) return null;
  if (intent.mime !== "audio/wav" && intent.mime !== "audio/mpeg") return null;
  const byteSize = intent.byteSize;
  const exp = intent.exp;
  if (!Number.isFinite(byteSize) || byteSize === undefined || byteSize <= 0 || byteSize > MUSIC_ANALYZER_MAX_UPLOAD_BYTES) {
    return null;
  }
  if (!Number.isFinite(exp) || exp === undefined || exp < nowMs) return null;
  if (intent.storagePath !== buildRunStoragePath(intent.runId, intent.filename)) return null;
  if (!intent.storagePath.startsWith(`runs/${intent.runId}/`)) return null;
  return intent as MusicAnalyzerUploadIntent;
}

export function uploadTicketExpiry(nowMs: number): number {
  return nowMs + MUSIC_ANALYZER_UPLOAD_TICKET_TTL_MS;
}

export function storageBucketName(): typeof MUSIC_ANALYZER_RUNS_BUCKET {
  return MUSIC_ANALYZER_RUNS_BUCKET;
}
