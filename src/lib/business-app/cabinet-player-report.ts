import { createHash } from "node:crypto";

import { isSpaLiveReport, type SpaLiveReport } from "@/lib/business-app/spa-live-report";
import { SPA_DEVICE_SECRET } from "@/lib/business-app/spa-player-report";

/** Fresh device claim window. Matches business_player_live_claim (5 minutes). */
export const CABINET_DEVICE_CLAIM_MS = 5 * 60 * 1000;

export type CabinetReportBody =
  | { kind: "heartbeat"; deviceSecret: string }
  | { kind: "playback"; deviceSecret: string; report: SpaLiveReport };

export function isCabinetReportSource(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && (value as { source?: unknown }).source === "cabinet";
}

export function parseCabinetReportBody(value: unknown): CabinetReportBody | null {
  if (!isCabinetReportSource(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.deviceSecret !== "string" || !SPA_DEVICE_SECRET.test(body.deviceSecret)) return null;
  if (body.kind === "heartbeat") return { kind: "heartbeat", deviceSecret: body.deviceSecret };
  if (body.kind === "playback" && isSpaLiveReport(body.report)) {
    return { kind: "playback", deviceSecret: body.deviceSecret, report: body.report };
  }
  return null;
}

export function cabinetDeviceSecretHex(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function cabinetDeviceSecretBytea(secret: string): string {
  return `\\x${cabinetDeviceSecretHex(secret)}`;
}

/** Postgres bytea as returned by PostgREST (`\\x` + hex) or a 32-byte buffer. */
export function cabinetByteaHex(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) {
    return value.length === 32 ? Buffer.from(value).toString("hex") : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const hexBody = trimmed.replace(/^\\+x/i, "");
  if (/^[0-9a-f]{64}$/i.test(hexBody) && hexBody.length === 64 && (trimmed.length === 64 || trimmed.toLowerCase().includes("x"))) {
    return hexBody.toLowerCase();
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded.toString("hex");
  } catch {
    return null;
  }
  return null;
}

/**
 * Another browser may hold the player for 5 minutes. The same secret refreshes the claim.
 * A stale claim can be taken over. Mirrors business_player_live_claim without a new RPC.
 */
export function cabinetDeviceClaimOpen(
  existingHex: string | null,
  nextHex: string,
  lastSeenMs: number | null,
  nowMs: number,
): boolean {
  if (!existingHex || existingHex === nextHex) return true;
  if (lastSeenMs == null || !Number.isFinite(lastSeenMs)) return true;
  return nowMs - lastSeenMs > CABINET_DEVICE_CLAIM_MS;
}
