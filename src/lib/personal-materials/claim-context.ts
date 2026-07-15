import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  PERSONAL_MATERIAL_CLAIM_COOKIE,
  PERSONAL_MATERIAL_CLAIM_PURPOSE,
} from "./types";

const CLAIM_CONTEXT_VERSION = 1;
const DEFAULT_TTL_SECONDS = 30 * 60;

export type PersonalMaterialClaimContextPayload = {
  v: typeof CLAIM_CONTEXT_VERSION;
  purpose: typeof PERSONAL_MATERIAL_CLAIM_PURPOSE;
  materialId: string;
  nonce: string;
  exp: number;
};

export type SignedPersonalMaterialClaimContext = {
  payload: PersonalMaterialClaimContextPayload;
  signature: string;
  cookieValue: string;
};

export type PersonalMaterialClaimCookieOptions = {
  maxAgeSeconds?: number;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

function getClaimContextSecret(): string {
  const secret =
    process.env.PERSONAL_MATERIAL_CLAIM_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    throw new Error("personal_material_claim_secret_not_configured");
  }

  return secret;
}

function encodePayload(payload: PersonalMaterialClaimContextPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): PersonalMaterialClaimContextPayload {
  const json = Buffer.from(encoded, "base64url").toString("utf8");
  const parsed = JSON.parse(json) as PersonalMaterialClaimContextPayload;

  if (
    parsed.v !== CLAIM_CONTEXT_VERSION ||
    parsed.purpose !== PERSONAL_MATERIAL_CLAIM_PURPOSE ||
    typeof parsed.materialId !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.exp !== "number"
  ) {
    throw new Error("invalid_claim_context_payload");
  }

  return parsed;
}

function signEncodedPayload(encodedPayload: string): string {
  return createHmac("sha256", getClaimContextSecret())
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

export function createSignedClaimContext(
  materialId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): SignedPersonalMaterialClaimContext {
  const payload: PersonalMaterialClaimContextPayload = {
    v: CLAIM_CONTEXT_VERSION,
    purpose: PERSONAL_MATERIAL_CLAIM_PURPOSE,
    materialId,
    nonce: randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const encodedPayload = encodePayload(payload);
  const signature = signEncodedPayload(encodedPayload);

  return {
    payload,
    signature,
    cookieValue: `${encodedPayload}.${signature}`,
  };
}

export function verifySignedClaimContext(
  cookieValue: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): PersonalMaterialClaimContextPayload {
  const [encodedPayload, signature] = cookieValue.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("invalid_claim_context_cookie");
  }

  const expectedSignature = signEncodedPayload(encodedPayload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);

  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("invalid_claim_context_signature");
  }

  const payload = decodePayload(encodedPayload);

  if (payload.exp <= nowSeconds) {
    throw new Error("claim_context_expired");
  }

  return payload;
}

export function buildClaimContextCookieHeader(
  signedContext: SignedPersonalMaterialClaimContext,
  options: PersonalMaterialClaimCookieOptions = {},
): string {
  const maxAge = options.maxAgeSeconds ?? DEFAULT_TTL_SECONDS;
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const sameSite = options.sameSite ?? "lax";

  const parts = [
    `${PERSONAL_MATERIAL_CLAIM_COOKIE}=${signedContext.cookieValue}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearClaimContextCookieHeader(): string {
  return `${PERSONAL_MATERIAL_CLAIM_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`;
}
