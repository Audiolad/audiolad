import "server-only";

import { isMaxHostname } from "@/lib/max/host";
import {
  listMaxPublishedCatalog,
  type ListMaxPublishedCatalogInput,
  type MaxCatalogResult,
} from "@/lib/max/catalog";
import { readMaxCatalogProduct, type MaxCatalogProduct } from "@/lib/max/catalog-product";
import {
  MAX_HOME_SHELF_LIMIT,
  MAX_HOME_SHELVES,
  type MaxHomeShelves,
} from "@/lib/max/home";
import {
  isAllowedMaxSessionOrigin,
  MAX_SESSION_BODY_MAX_BYTES,
} from "@/lib/max/session-http";
import { verifyMaxInitData } from "@/lib/max/verify-init-data";
import { getHostnameFromHeaders } from "@/lib/school/host";

export { setListMaxPublishedCatalogForTests } from "@/lib/max/catalog";

export const dynamic = "force-dynamic";
export const MAX_HOME_BODY_MAX_BYTES = MAX_SESSION_BODY_MAX_BYTES;
export const isAllowedMaxHomeOrigin = isAllowedMaxSessionOrigin;

type HomeErrorReason =
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

const PARSE_REASONS = new Set<HomeErrorReason>([
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

function errorResponse(reason: HomeErrorReason, status: number) {
  return Response.json({ ok: false, reason }, { status });
}

function statusForReason(reason: HomeErrorReason): number {
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

function catalogInputForShelf(
  shelf: (typeof MAX_HOME_SHELVES)[number],
): ListMaxPublishedCatalogInput {
  const input: ListMaxPublishedCatalogInput = {};
  if (shelf.section) {
    input.section = shelf.section;
  }
  if (shelf.access !== "all") {
    input.access = shelf.access;
  }
  return input;
}

function toHomeShelfItems(result: MaxCatalogResult): MaxCatalogProduct[] | null {
  if (!result.ok) return null;
  return result.items.slice(0, MAX_HOME_SHELF_LIMIT).flatMap((item) => {
    const safe = readMaxCatalogProduct(item);
    return safe ? [safe] : [];
  });
}

export async function POST(request: Request) {
  const hostname = getHostnameFromHeaders(request.headers);
  if (!isMaxHostname(hostname)) {
    return errorResponse("forbidden_host", 404);
  }

  if (!isAllowedMaxHomeOrigin(request)) {
    return errorResponse("forbidden_origin", 403);
  }

  const botToken = process.env.MAX_BOT_TOKEN?.trim();
  if (!botToken) {
    return errorResponse("service_unavailable", 503);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_HOME_BODY_MAX_BYTES) {
      return errorResponse("payload_too_large", 413);
    }
  }

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength === 0) {
    return errorResponse("invalid_request", 400);
  }
  if (rawBody.byteLength > MAX_HOME_BODY_MAX_BYTES) {
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

  const settled = await Promise.all(
    MAX_HOME_SHELVES.map(async (shelf) => {
      const catalog = await listMaxPublishedCatalog(catalogInputForShelf(shelf));
      return { id: shelf.id, catalog };
    }),
  );

  const shelves = {} as MaxHomeShelves;
  for (const entry of settled) {
    const items = toHomeShelfItems(entry.catalog);
    if (!items) {
      return errorResponse("storage_unavailable", 503);
    }
    shelves[entry.id] = items;
  }

  return Response.json(
    { ok: true, shelves },
    { headers: { "Cache-Control": "no-store" } },
  );
}
