import { NextResponse } from "next/server";

import { getPlatformOwnerSessionIfOwner } from "@/lib/admin/require-platform-owner";
import { appendChunk, UPLOAD_CHUNK_MAX_BYTES, type JobSlot } from "@/lib/evidence/matcher.server";
import { isSameOriginRequest } from "@/lib/evidence/same-origin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * t1578u: one chunk (≤ 3 MB, below the nginx body limit) of an inspector recording or of the
 * claimed song. Owner only, same-origin only, offset-checked so retries are idempotent.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ ok: false }, { status: 403, headers: NO_STORE });
  const owner = await getPlatformOwnerSessionIfOwner();
  if (!owner) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  const url = new URL(request.url);
  const id = url.searchParams.get("job") ?? "";
  const slot = url.searchParams.get("slot") as JobSlot;
  const offset = Number(url.searchParams.get("offset"));
  if ((slot !== "input" && slot !== "claim") || !Number.isSafeInteger(offset) || offset < 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400, headers: NO_STORE });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > UPLOAD_CHUNK_MAX_BYTES) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413, headers: NO_STORE });
  const body = new Uint8Array(await request.arrayBuffer());
  const res = await appendChunk(id, slot, offset, body);
  if (!res.ok) {
    const status = res.error === "not_found" ? 404 : res.error === "too_large" ? 413 : 409;
    return NextResponse.json(res, { status, headers: NO_STORE });
  }
  return NextResponse.json(res, { status: 200, headers: NO_STORE });
}
