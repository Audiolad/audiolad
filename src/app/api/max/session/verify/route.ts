import "server-only";

import { isMaxHostname, MAX_HOSTNAME } from "@/lib/max/host";
import {
  MAX_EXTERNAL_IDENTITY_PROVIDER,
  touchExternalIdentity,
} from "@/lib/max/touch-external-identity";
import { verifyMaxInitData } from "@/lib/max/verify-init-data";
import { getHostnameFromHeaders } from "@/lib/school/host";

export const dynamic = "force-dynamic";

export const MAX_VERIFY_BODY_MAX_BYTES = 16_384;

type VerifyErrorReason =
  | "forbidden_host"
  | "forbidden_origin"
  | "service_unavailable"
  | "payload_too_large"
  | "invalid_request"
  | "empty_init_data"
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
  | "future"
  | "storage_unavailable";

const PARSE_REASONS = new Set<VerifyErrorReason>([
  "empty_init_data",
  "missing_hash",
  "duplicate_hash",
  "duplicate_key",
  "malformed_encoding",
  "malformed_user",
  "malformed_chat",
  "missing_user",
  "missing_user_id",
  "invalid_auth_date",
]);

function errorResponse(reason: VerifyErrorReason, status: number) {
  return Response.json({ ok: false, reason }, { status });
}

export function isAllowedMaxVerifyOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).hostname === MAX_HOSTNAME;
    } catch {
      return false;
    }
  }

  if (secFetchSite === "same-origin" || secFetchSite === "none") {
    return true;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).hostname === MAX_HOSTNAME;
  } catch {
    return false;
  }
}

function statusForReason(reason: VerifyErrorReason): number {
  if (reason === "payload_too_large") return 413;
  if (reason === "storage_unavailable" || reason === "service_unavailable") {
    return 503;
  }
  if (reason === "invalid_hash" || reason === "expired" || reason === "future") {
    return 401;
  }
  if (PARSE_REASONS.has(reason)) return 400;
  return 400;
}

export async function POST(request: Request) {
  const hostname = getHostnameFromHeaders(request.headers);
  if (!isMaxHostname(hostname)) {
    return errorResponse("forbidden_host", 404);
  }

  if (!isAllowedMaxVerifyOrigin(request)) {
    return errorResponse("forbidden_origin", 403);
  }

  const botToken = process.env.MAX_BOT_TOKEN?.trim();
  if (!botToken) {
    return errorResponse("service_unavailable", 503);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_VERIFY_BODY_MAX_BYTES) {
      return errorResponse("payload_too_large", 413);
    }
  }

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength === 0) {
    return errorResponse("invalid_request", 400);
  }
  if (rawBody.byteLength > MAX_VERIFY_BODY_MAX_BYTES) {
    return errorResponse("payload_too_large", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return errorResponse("invalid_request", 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorResponse("invalid_request", 400);
  }

  const initData = (parsed as { initData?: unknown }).initData;
  if (typeof initData !== "string") {
    return errorResponse("invalid_request", 400);
  }

  const result = verifyMaxInitData(initData, botToken);
  if (!result.ok) {
    if (result.reason === "missing_token") {
      return errorResponse("service_unavailable", 503);
    }

    return errorResponse(result.reason, statusForReason(result.reason));
  }

  const touch = await touchExternalIdentity(
    MAX_EXTERNAL_IDENTITY_PROVIDER,
    result.data.user.id,
  );
  if (!touch.ok) {
    return errorResponse("storage_unavailable", 503);
  }

  return Response.json({ ok: true, linked: touch.linked });
}
