import { normalizeHostname } from "@/lib/school/host";

export const VK_REQUEST_BODY_MAX_BYTES = 16_384;

const TRACK_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function vkJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function vkFail(reason: string, status: number) {
  return vkJson({ ok: false, reason }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Same-origin Mini App calls only. VK frames the page; the document origin stays Audiolad. */
export function isAllowedVkMiniAppRequest(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") return false;

  const requestHost = normalizeHostname(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  if (!requestHost) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return normalizeHostname(new URL(origin).host) === requestHost;
    } catch {
      return false;
    }
  }

  return secFetchSite === "same-origin" || secFetchSite === "none" || !secFetchSite;
}

export async function readVkJsonPost(
  request: Request,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  if (!isAllowedVkMiniAppRequest(request)) {
    return { ok: false, response: vkFail("forbidden_origin", 403) };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > VK_REQUEST_BODY_MAX_BYTES) {
      return { ok: false, response: vkFail("payload_too_large", 413) };
    }
  }

  const raw = await request.arrayBuffer();
  if (!raw.byteLength || raw.byteLength > VK_REQUEST_BODY_MAX_BYTES) {
    return {
      ok: false,
      response: vkFail(
        raw.byteLength > VK_REQUEST_BODY_MAX_BYTES ? "payload_too_large" : "invalid_request",
        raw.byteLength > VK_REQUEST_BODY_MAX_BYTES ? 413 : 400,
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return { ok: false, response: vkFail("invalid_request", 400) };
  }
  if (!isRecord(parsed)) {
    return { ok: false, response: vkFail("invalid_request", 400) };
  }
  return { ok: true, body: parsed };
}

export function readVkTarget(body: Record<string, unknown>): string | null {
  if (typeof body.target !== "string") return null;
  const target = body.target.trim();
  return target || null;
}

export function readVkTrackId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trackId = value.trim();
  return TRACK_ID_RE.test(trackId) ? trackId : null;
}
