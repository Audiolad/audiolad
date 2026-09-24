import "server-only";

import { isMaxHostname } from "@/lib/max/host";
import { getMaxPublishedProduct } from "@/lib/max/product";
import { isAllowedMaxSessionOrigin, MAX_SESSION_BODY_MAX_BYTES } from "@/lib/max/session-http";
import { resolveMaxNativeUser } from "@/lib/max/session-binding";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "@/lib/max/touch-external-identity";
import { verifyMaxInitData } from "@/lib/max/verify-init-data";
import { getHostnameFromHeaders } from "@/lib/school/host";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";
export { setGetMaxPublishedProductForTests } from "@/lib/max/product";

function fail(reason: string, status: number) {
  return Response.json({ ok: false, reason }, { status });
}

export async function POST(request: Request) {
  if (!isMaxHostname(getHostnameFromHeaders(request.headers))) return fail("forbidden_host", 404);
  if (!isAllowedMaxSessionOrigin(request)) return fail("forbidden_origin", 403);
  const botToken = process.env.MAX_BOT_TOKEN?.trim();
  if (!botToken) return fail("service_unavailable", 503);
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_SESSION_BODY_MAX_BYTES) {
      return fail("payload_too_large", 413);
    }
  }
  const raw = await request.arrayBuffer();
  if (!raw.byteLength || raw.byteLength > MAX_SESSION_BODY_MAX_BYTES) {
    return fail("invalid_request", raw.byteLength > MAX_SESSION_BODY_MAX_BYTES ? 413 : 400);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(raw)); } catch { return fail("invalid_request", 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("invalid_request", 400);
  }
  const body = parsed as { initData?: unknown; authorSlug?: unknown; productSlug?: unknown };
  if (
    typeof body.initData !== "string" ||
    typeof body.authorSlug !== "string" ||
    typeof body.productSlug !== "string"
  ) return fail("invalid_request", 400);
  const verified = verifyMaxInitData(body.initData, botToken);
  if (!verified.ok) {
    const status = ["invalid_hash", "expired", "future"].includes(verified.reason) ? 401 : 400;
    return fail(verified.reason, status);
  }
  const native = await resolveMaxNativeUser(MAX_EXTERNAL_IDENTITY_PROVIDER, verified.data.user.id);
  if (!native.ok) return fail("storage_unavailable", 503);
  if (!native.userId) return fail("unlinked", 403);
  const result = await getMaxPublishedProduct(body.authorSlug, body.productSlug);
  if (!result.ok) return fail("storage_unavailable", 503);
  if (!result.product) return fail("not_found", 404);
  return Response.json({ ok: true, product: result.product }, {
    headers: { "Cache-Control": "no-store" },
  });
}
