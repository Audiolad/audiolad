import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-only MAX WebAppData / initData verifier.
 *
 * Official algorithm: https://dev.max.ru/docs/webapps/validation
 * Input is the raw `window.WebApp.initData` query string, not the URL hash
 * and not `initDataUnsafe`. Platform / version / deviceName are not signed.
 */

export const MAX_INIT_DATA_MAX_AGE_SECONDS = 3600;
export const MAX_INIT_DATA_FUTURE_SKEW_SECONDS = 120;
export const MAX_INIT_DATA_MAX_BYTES = 12_288;

const HMAC_KEY_WEB_APP_DATA = "WebAppData";

export type MaxInitDataRejectReason =
  | "empty_init_data"
  | "payload_too_large"
  | "missing_token"
  | "missing_hash"
  | "duplicate_hash"
  | "duplicate_key"
  | "malformed_encoding"
  | "malformed_user"
  | "malformed_chat"
  | "missing_user"
  | "missing_user_id"
  | "invalid_auth_date"
  | "invalid_hash"
  | "expired"
  | "future";

export type VerifiedMaxUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export type VerifiedMaxChat = {
  id: string;
  type?: string;
};

export type VerifiedMaxInitData = {
  query_id?: string;
  auth_date: number;
  start_param?: string;
  user: VerifiedMaxUser;
  chat?: VerifiedMaxChat;
};

export type VerifyMaxInitDataResult =
  | { ok: true; data: VerifiedMaxInitData }
  | { ok: false; reason: MaxInitDataRejectReason };

export type VerifyMaxInitDataOptions = {
  nowSeconds?: number;
};

function fail(reason: MaxInitDataRejectReason): VerifyMaxInitDataResult {
  return { ok: false, reason };
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isDecimalIntegerString(value: string): boolean {
  return /^-?[0-9]+$/.test(value);
}

/**
 * Prefer the raw JSON digits for `id`. JSON.parse turns integers wider than
 * Number.MAX_SAFE_INTEGER into an already-rounded JS number (e.g.
 * 9007199254740993 → 9007199254740992). That rounded number must never become
 * provider_user_id, and it is not a UUID.
 */
function extractRawJsonNumberId(rawJson: string): string | null {
  const match = rawJson.match(/"id"\s*:\s*(-?[0-9]+)(?=$|[^0-9.eE])/);
  return match?.[1] ?? null;
}

function readExternalId(value: unknown, rawJson: string): string | null {
  const raw = extractRawJsonNumberId(rawJson);
  if (raw && isDecimalIntegerString(raw)) {
    return raw;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return isDecimalIntegerString(trimmed) ? trimmed : null;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }

  return null;
}

function normalizeHex(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    return null;
  }

  return normalized;
}

function timingSafeEqualHex(expectedHex: string, providedHex: string): boolean {
  const expectedNorm = normalizeHex(expectedHex);
  const providedNorm = normalizeHex(providedHex);
  if (!expectedNorm || !providedNorm) {
    return false;
  }

  const expected = Buffer.from(expectedNorm, "hex");
  const provided = Buffer.from(providedNorm, "hex");
  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

function computeSignatureHex(botToken: string, launchParams: string): string {
  const secretKey = createHmac("sha256", HMAC_KEY_WEB_APP_DATA)
    .update(botToken)
    .digest();

  return createHmac("sha256", secretKey).update(launchParams).digest("hex");
}

function parsePairs(
  rawInitData: string,
):
  | { ok: true; hash: string; pairs: { key: string; value: string }[] }
  | { ok: false; reason: MaxInitDataRejectReason } {
  const pairs: { key: string; value: string }[] = [];
  const seen = new Set<string>();
  let hash: string | null = null;

  for (const segment of rawInitData.split("&")) {
    if (segment.length === 0) {
      return { ok: false, reason: "malformed_encoding" };
    }

    const eq = segment.indexOf("=");
    if (eq <= 0) {
      return { ok: false, reason: "malformed_encoding" };
    }

    const key = segment.slice(0, eq);
    const rawValue = segment.slice(eq + 1);

    if (seen.has(key)) {
      return {
        ok: false,
        reason: key === "hash" ? "duplicate_hash" : "duplicate_key",
      };
    }

    seen.add(key);

    if (key.includes("\n") || key.includes("\r")) {
      return { ok: false, reason: "malformed_encoding" };
    }

    let value: string;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      return { ok: false, reason: "malformed_encoding" };
    }

    if (key === "hash") {
      hash = value;
      continue;
    }

    pairs.push({ key, value });
  }

  if (hash === null || hash.length === 0) {
    return { ok: false, reason: "missing_hash" };
  }

  return { ok: true, hash, pairs };
}

function parseAuthDate(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return null;
  }

  const authDate = Number(raw);
  if (!Number.isSafeInteger(authDate) || raw !== String(authDate)) {
    return null;
  }

  return authDate;
}

function parseUser(
  raw: string | undefined,
):
  | { ok: true; user: VerifiedMaxUser }
  | { ok: false; reason: MaxInitDataRejectReason } {
  if (raw === undefined) {
    return { ok: false, reason: "missing_user" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed_user" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "malformed_user" };
  }

  const record = parsed as Record<string, unknown>;
  if (!Object.hasOwn(record, "id")) {
    return { ok: false, reason: "missing_user_id" };
  }

  const id = readExternalId(record.id, raw);
  if (!id) {
    return { ok: false, reason: "missing_user_id" };
  }

  const user: VerifiedMaxUser = { id };
  const firstName = optionalString(record.first_name);
  const lastName = optionalString(record.last_name);
  const username = optionalString(record.username);
  const languageCode = optionalString(record.language_code);
  const photoUrl = optionalString(record.photo_url);

  if (firstName) user.first_name = firstName;
  if (lastName) user.last_name = lastName;
  if (username) user.username = username;
  if (languageCode) user.language_code = languageCode;
  if (photoUrl) user.photo_url = photoUrl;

  return { ok: true, user };
}

function parseChat(
  raw: string | undefined,
):
  | { ok: true; chat?: VerifiedMaxChat }
  | { ok: false; reason: MaxInitDataRejectReason } {
  if (raw === undefined) {
    return { ok: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed_chat" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "malformed_chat" };
  }

  const record = parsed as Record<string, unknown>;
  if (!Object.hasOwn(record, "id")) {
    return { ok: true };
  }

  const id = readExternalId(record.id, raw);
  if (!id) {
    return { ok: true };
  }

  const chat: VerifiedMaxChat = { id };
  const type = optionalString(record.type);
  if (type) chat.type = type;

  return { ok: true, chat };
}

export function verifyMaxInitData(
  rawInitData: string,
  botToken: string,
  options: VerifyMaxInitDataOptions = {},
): VerifyMaxInitDataResult {
  if (typeof rawInitData !== "string" || rawInitData.length === 0) {
    return fail("empty_init_data");
  }

  if (rawInitData.length > MAX_INIT_DATA_MAX_BYTES) {
    return fail("payload_too_large");
  }

  if (typeof botToken !== "string" || botToken.length === 0) {
    return fail("missing_token");
  }

  const parsed = parsePairs(rawInitData);
  if (!parsed.ok) {
    return fail(parsed.reason);
  }

  const signed = [...parsed.pairs].sort((left, right) => {
    if (left.key < right.key) return -1;
    if (left.key > right.key) return 1;
    return 0;
  });
  const launchParams = signed
    .map((pair) => `${pair.key}=${pair.value}`)
    .join("\n");
  const expectedHex = computeSignatureHex(botToken, launchParams);

  if (!timingSafeEqualHex(expectedHex, parsed.hash)) {
    return fail("invalid_hash");
  }

  const fields = new Map(signed.map((pair) => [pair.key, pair.value]));
  const user = parseUser(fields.get("user"));
  if (!user.ok) {
    return fail(user.reason);
  }

  const authDate = parseAuthDate(fields.get("auth_date"));
  if (authDate === null) {
    return fail("invalid_auth_date");
  }

  const nowSeconds =
    options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > MAX_INIT_DATA_MAX_AGE_SECONDS) {
    return fail("expired");
  }
  if (authDate > nowSeconds + MAX_INIT_DATA_FUTURE_SKEW_SECONDS) {
    return fail("future");
  }

  const chat = parseChat(fields.get("chat"));
  if (!chat.ok) {
    return fail(chat.reason);
  }

  const data: VerifiedMaxInitData = {
    auth_date: authDate,
    user: user.user,
  };

  const queryId = optionalString(fields.get("query_id"));
  const startParam = optionalString(fields.get("start_param"));
  if (queryId) data.query_id = queryId;
  if (startParam) data.start_param = startParam;
  if (chat.chat) data.chat = chat.chat;

  return { ok: true, data };
}
