import "server-only";

import { isMaxHostname } from "@/lib/max/host";
import {
  linkExternalIdentity,
} from "@/lib/max/link-external-identity";
import {
  isAllowedMaxSessionOrigin,
  MAX_SESSION_BODY_MAX_BYTES,
} from "@/lib/max/session-http";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "@/lib/max/touch-external-identity";
import { verifyMaxInitData } from "@/lib/max/verify-init-data";
import { getHostnameFromHeaders } from "@/lib/school/host";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export { setLinkExternalIdentityForTests } from "@/lib/max/link-external-identity";

export const dynamic = "force-dynamic";

export const MAX_LINK_BODY_MAX_BYTES = MAX_SESSION_BODY_MAX_BYTES;
export const isAllowedMaxLinkOrigin = isAllowedMaxSessionOrigin;

type LinkErrorReason =
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
  | "unauthenticated"
  | "identity_already_linked"
  | "user_already_has_max_identity"
  | "storage_unavailable";

const PARSE_REASONS = new Set<LinkErrorReason>([
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

type RequestUser = { id: string };

export type GetRequestUserFn = (request: Request) => Promise<RequestUser | null>;

async function getRequestUserImpl(request: Request): Promise<RequestUser | null> {
  try {
    const supabase = await createClientFromRequest(request);
    const { data, error } = await supabase.auth.getUser();
    const id = data.user?.id;
    if (error || typeof id !== "string" || id.length === 0) {
      return null;
    }
    return { id };
  } catch {
    return null;
  }
}

let getRequestUser: GetRequestUserFn = getRequestUserImpl;

export function setGetRequestUserForTests(fn: GetRequestUserFn | null): void {
  getRequestUser = fn ?? getRequestUserImpl;
}

function errorResponse(reason: LinkErrorReason, status: number) {
  return Response.json({ ok: false, reason }, { status });
}

function statusForReason(reason: LinkErrorReason): number {
  if (reason === "payload_too_large") return 413;
  if (reason === "storage_unavailable" || reason === "service_unavailable") {
    return 503;
  }
  if (
    reason === "invalid_hash" ||
    reason === "expired" ||
    reason === "future" ||
    reason === "unauthenticated"
  ) {
    return 401;
  }
  if (
    reason === "identity_already_linked" ||
    reason === "user_already_has_max_identity"
  ) {
    return 409;
  }
  if (PARSE_REASONS.has(reason)) return 400;
  return 400;
}

export async function POST(request: Request) {
  const hostname = getHostnameFromHeaders(request.headers);
  if (!isMaxHostname(hostname)) {
    return errorResponse("forbidden_host", 404);
  }

  if (!isAllowedMaxSessionOrigin(request)) {
    return errorResponse("forbidden_origin", 403);
  }

  const botToken = process.env.MAX_BOT_TOKEN?.trim();
  if (!botToken) {
    return errorResponse("service_unavailable", 503);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_SESSION_BODY_MAX_BYTES) {
      return errorResponse("payload_too_large", 413);
    }
  }

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength === 0) {
    return errorResponse("invalid_request", 400);
  }
  if (rawBody.byteLength > MAX_SESSION_BODY_MAX_BYTES) {
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

  const sessionUser = await getRequestUser(request);
  if (!sessionUser) {
    return errorResponse("unauthenticated", 401);
  }

  const link = await linkExternalIdentity(
    MAX_EXTERNAL_IDENTITY_PROVIDER,
    result.data.user.id,
    sessionUser.id,
  );
  if (!link.ok) {
    if (link.reason === "identity_conflict") {
      return errorResponse("identity_already_linked", 409);
    }
    if (link.reason === "user_conflict") {
      return errorResponse("user_already_has_max_identity", 409);
    }
    return errorResponse("storage_unavailable", 503);
  }

  return Response.json({ ok: true, linked: true });
}
