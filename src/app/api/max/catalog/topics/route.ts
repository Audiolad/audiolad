import "server-only";

import { loadMaxCatalogTopics } from "@/lib/max/catalog-topics";
import { isMaxHostname } from "@/lib/max/host";
import {
  isAllowedMaxSessionOrigin,
  MAX_SESSION_BODY_MAX_BYTES,
} from "@/lib/max/session-http";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "@/lib/max/touch-external-identity";
import { resolveMaxNativeUser } from "@/lib/max/session-binding";
import { verifyMaxInitData } from "@/lib/max/verify-init-data";
import { getHostnameFromHeaders } from "@/lib/school/host";

export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";
export { setListMaxCatalogTopicsForTests } from "@/lib/max/catalog-topics";

export const dynamic = "force-dynamic";
export const MAX_CATALOG_TOPICS_BODY_MAX_BYTES = MAX_SESSION_BODY_MAX_BYTES;
export const isAllowedMaxCatalogTopicsOrigin = isAllowedMaxSessionOrigin;

type TopicsErrorReason =
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
  | "unlinked"
  | "storage_unavailable";

const PARSE_REASONS = new Set<TopicsErrorReason>([
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

function errorResponse(reason: TopicsErrorReason, status: number) {
  return Response.json({ ok: false, reason }, { status });
}

function statusForReason(reason: TopicsErrorReason): number {
  if (reason === "payload_too_large") return 413;
  if (reason === "storage_unavailable" || reason === "service_unavailable") {
    return 503;
  }
  if (reason === "unlinked") return 403;
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

  if (!isAllowedMaxCatalogTopicsOrigin(request)) {
    return errorResponse("forbidden_origin", 403);
  }

  const botToken = process.env.MAX_BOT_TOKEN?.trim();
  if (!botToken) {
    return errorResponse("service_unavailable", 503);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_CATALOG_TOPICS_BODY_MAX_BYTES) {
      return errorResponse("payload_too_large", 413);
    }
  }

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength === 0) {
    return errorResponse("invalid_request", 400);
  }
  if (rawBody.byteLength > MAX_CATALOG_TOPICS_BODY_MAX_BYTES) {
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

  const verified = verifyMaxInitData(initData, botToken);
  if (!verified.ok) {
    if (verified.reason === "missing_token") {
      return errorResponse("service_unavailable", 503);
    }

    return errorResponse(verified.reason, statusForReason(verified.reason));
  }

  const nativeUser = await resolveMaxNativeUser(
    MAX_EXTERNAL_IDENTITY_PROVIDER,
    verified.data.user.id,
  );
  if (!nativeUser.ok) {
    return errorResponse("storage_unavailable", 503);
  }
  if (!nativeUser.userId) {
    return errorResponse("unlinked", 403);
  }

  const topics = await loadMaxCatalogTopics();
  if (!topics.ok) {
    return errorResponse("storage_unavailable", 503);
  }

  return Response.json(
    { ok: true, topics: topics.topics },
    { headers: { "Cache-Control": "no-store" } },
  );
}
