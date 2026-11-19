import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { getPlatformOwnerSessionIfOwner } from "@/lib/admin/require-platform-owner";
import { jobFilePath } from "@/lib/evidence/matcher.server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const TYPES: Record<string, string> = {
  "result.json": "application/json; charset=utf-8",
  "report.json": "application/json; charset=utf-8",
  "report.sig": "application/octet-stream",
  "report.pdf": "application/pdf",
  "seal-public.pem": "application/x-pem-file",
  "VERIFY.txt": "text/plain; charset=utf-8",
};

/** t1578u: download a file of a match job (result, sealed report). Owner only. */
export async function GET(request: Request) {
  const owner = await getPlatformOwnerSessionIfOwner();
  if (!owner) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const file = url.searchParams.get("file") ?? "";
  const path = jobFilePath(id, file);
  if (!path || !TYPES[file]) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  let body: Buffer;
  try {
    body = await readFile(path);
  } catch {
    return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  }
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": TYPES[file],
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="audiolad-sverka-${id}-${file}"`,
    },
  });
}
