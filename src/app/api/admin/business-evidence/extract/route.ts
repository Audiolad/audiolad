import { NextResponse } from "next/server";

import { getPlatformOwnerSessionIfOwner } from "@/lib/admin/require-platform-owner";
import { readExtractFile } from "@/lib/evidence/extract.server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const TYPES: Record<string, string> = {
  "plays.csv": "text/csv; charset=utf-8",
  "facts.csv": "text/csv; charset=utf-8",
  "extract.pdf": "application/pdf",
  "manifest.json": "application/json; charset=utf-8",
  "manifest.sig": "application/octet-stream",
  "seal-public.pem": "application/x-pem-file",
  "VERIFY.txt": "text/plain; charset=utf-8",
};

/** t1578u: download one file of a play-log extract. Owner only, checked on every request. */
export async function GET(request: Request) {
  const owner = await getPlatformOwnerSessionIfOwner();
  if (!owner) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const file = url.searchParams.get("file") ?? "";
  const body = await readExtractFile(id, file);
  if (!body || !TYPES[file]) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": TYPES[file],
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="audiolad-${id}-${file}"`,
    },
  });
}
