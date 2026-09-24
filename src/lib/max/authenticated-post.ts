import "server-only";

import { isMaxHostname } from "@/lib/max/host";
import {
  isAllowedMaxSessionOrigin,
  MAX_SESSION_BODY_MAX_BYTES,
} from "@/lib/max/session-http";
import { resolveMaxNativeUser } from "@/lib/max/session-binding";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "@/lib/max/touch-external-identity";
import { verifyMaxInitData } from "@/lib/max/verify-init-data";
import { getHostnameFromHeaders } from "@/lib/school/host";

export type MaxAuthenticatedPostSuccess = {
  ok: true;
  userId: string;
  body: Record<string, unknown>;
};

export type MaxAuthenticatedPostFailure = {
  ok: false;
  response: Response;
};

function fail(reason: string, status: number): MaxAuthenticatedPostFailure {
  return {
    ok: false,
    response: Response.json(
      { ok: false, reason },
      { status, headers: { "Cache-Control": "no-store" } },
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function readMaxAuthenticatedPost(
  request: Request,
  requiredStringFields: readonly string[],
): Promise<MaxAuthenticatedPostSuccess | MaxAuthenticatedPostFailure> {
  if (!isMaxHostname(getHostnameFromHeaders(request.headers))) {
    return fail("forbidden_host", 404);
  }
  if (!isAllowedMaxSessionOrigin(request)) {
    return fail("forbidden_origin", 403);
  }

  const botToken = process.env.MAX_BOT_TOKEN?.trim();
  if (!botToken) {
    return fail("service_unavailable", 503);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_SESSION_BODY_MAX_BYTES) {
      return fail("payload_too_large", 413);
    }
  }

  const raw = await request.arrayBuffer();
  if (!raw.byteLength || raw.byteLength > MAX_SESSION_BODY_MAX_BYTES) {
    return fail(
      raw.byteLength > MAX_SESSION_BODY_MAX_BYTES
        ? "payload_too_large"
        : "invalid_request",
      raw.byteLength > MAX_SESSION_BODY_MAX_BYTES ? 413 : 400,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return fail("invalid_request", 400);
  }
  if (!isRecord(parsed)) {
    return fail("invalid_request", 400);
  }

  if (typeof parsed.initData !== "string") {
    return fail("invalid_request", 400);
  }
  for (const field of requiredStringFields) {
    if (typeof parsed[field] !== "string" || parsed[field].trim() === "") {
      return fail("invalid_request", 400);
    }
  }

  const verified = verifyMaxInitData(parsed.initData, botToken);
  if (!verified.ok) {
    const status = ["invalid_hash", "expired", "future"].includes(verified.reason)
      ? 401
      : 400;
    return fail(verified.reason, status);
  }

  const native = await resolveMaxNativeUser(
    MAX_EXTERNAL_IDENTITY_PROVIDER,
    verified.data.user.id,
  );
  if (!native.ok) {
    return fail("storage_unavailable", 503);
  }
  if (!native.userId) {
    return fail("unlinked", 403);
  }

  return { ok: true, userId: native.userId, body: parsed };
}
