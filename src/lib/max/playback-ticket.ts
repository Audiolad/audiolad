import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "@/lib/max/touch-external-identity";

export const MAX_PLAYBACK_TICKET_TTL_SECONDS = 21_600;
export const MAX_PLAYBACK_TICKET_VERSION = "v1";
const KEY_DOMAIN = "audiolad:max-playback-ticket:v1";

export type MaxPlaybackTicketClaims = {
  provider: typeof MAX_EXTERNAL_IDENTITY_PROVIDER;
  providerUserId: string;
  authorSlug: string;
  productSlug: string;
  issuedAt: number;
  expiresAt: number;
};

export type MintMaxPlaybackTicketResult = {
  token: string;
  expiresIn: number;
};

export type VerifyMaxPlaybackTicketResult =
  | { ok: true; claims: MaxPlaybackTicketClaims }
  | {
      ok: false;
      reason: "malformed" | "tampered" | "expired" | "wrong_version";
    };

let ticketNowForTests: number | null = null;

export function setMaxPlaybackTicketNowForTests(nowSeconds: number | null) {
  ticketNowForTests = nowSeconds;
}

function ticketNowSeconds(override?: number): number {
  return override ?? ticketNowForTests ?? Math.floor(Date.now() / 1000);
}

function deriveTicketKey(botToken: string): Buffer {
  return createHmac("sha256", botToken).update(KEY_DOMAIN).digest();
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function fromBase64Url(value: string): Buffer | null {
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseClaims(value: unknown): MaxPlaybackTicketClaims | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (
    row.provider !== MAX_EXTERNAL_IDENTITY_PROVIDER ||
    !isNonEmptyString(row.providerUserId) ||
    !isNonEmptyString(row.authorSlug) ||
    !isNonEmptyString(row.productSlug) ||
    typeof row.issuedAt !== "number" ||
    typeof row.expiresAt !== "number" ||
    !Number.isFinite(row.issuedAt) ||
    !Number.isFinite(row.expiresAt)
  ) {
    return null;
  }

  return {
    provider: MAX_EXTERNAL_IDENTITY_PROVIDER,
    providerUserId: row.providerUserId.trim(),
    authorSlug: row.authorSlug.trim(),
    productSlug: row.productSlug.trim(),
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
  };
}

export function mintMaxPlaybackTicket(
  input: {
    providerUserId: string;
    authorSlug: string;
    productSlug: string;
  },
  options?: { nowSeconds?: number; botToken?: string },
): MintMaxPlaybackTicketResult {
  const botToken = (options?.botToken ?? process.env.MAX_BOT_TOKEN ?? "").trim();
  if (!botToken) {
    throw new Error("max_playback_ticket_key_unavailable");
  }

  const now = ticketNowSeconds(options?.nowSeconds);
  const claims: MaxPlaybackTicketClaims = {
    provider: MAX_EXTERNAL_IDENTITY_PROVIDER,
    providerUserId: input.providerUserId.trim(),
    authorSlug: input.authorSlug.trim(),
    productSlug: input.productSlug.trim(),
    issuedAt: now,
    expiresAt: now + MAX_PLAYBACK_TICKET_TTL_SECONDS,
  };

  const key = deriveTicketKey(botToken);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(claims), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    token: `${MAX_PLAYBACK_TICKET_VERSION}.${toBase64Url(iv)}.${toBase64Url(ciphertext)}.${toBase64Url(tag)}`,
    expiresIn: MAX_PLAYBACK_TICKET_TTL_SECONDS,
  };
}

export function verifyMaxPlaybackTicket(
  token: string,
  options?: { nowSeconds?: number; botToken?: string },
): VerifyMaxPlaybackTicketResult {
  if (typeof token !== "string" || token.trim() === "") {
    return { ok: false, reason: "malformed" };
  }

  const parts = token.trim().split(".");
  if (parts.length !== 4) {
    return { ok: false, reason: "malformed" };
  }

  const [version, ivPart, ciphertextPart, tagPart] = parts;
  if (version !== MAX_PLAYBACK_TICKET_VERSION) {
    return { ok: false, reason: "wrong_version" };
  }

  const iv = fromBase64Url(ivPart);
  const ciphertext = fromBase64Url(ciphertextPart);
  const tag = fromBase64Url(tagPart);
  if (!iv || iv.length !== 12 || !ciphertext || !tag || tag.length !== 16) {
    return { ok: false, reason: "malformed" };
  }

  const botToken = (options?.botToken ?? process.env.MAX_BOT_TOKEN ?? "").trim();
  if (!botToken) {
    return { ok: false, reason: "tampered" };
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveTicketKey(botToken), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const claims = parseClaims(JSON.parse(plaintext.toString("utf8")));
    if (!claims) {
      return { ok: false, reason: "tampered" };
    }

    if (ticketNowSeconds(options?.nowSeconds) >= claims.expiresAt) {
      return { ok: false, reason: "expired" };
    }

    return { ok: true, claims };
  } catch {
    return { ok: false, reason: "tampered" };
  }
}
