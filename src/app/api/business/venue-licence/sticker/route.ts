import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { isVenueLicencePublicEnabled } from "@/lib/business-app/venue-licence/flag";
import { handleVenueStickerDownload } from "@/lib/business-app/venue-licence/sticker-access";
import { createVenueStickerReader } from "@/lib/business-app/venue-licence/sticker-access.server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

let logoHref: Promise<string | null> | null = null;

/** The brand mark from public/, inlined so the downloaded file needs no network. Without it the sticker still prints. */
function stickerLogoHref(): Promise<string | null> {
  logoHref ??= readFile(path.join(process.cwd(), "public", "business", "brand", "mark-leather.webp"))
    .then((bytes) => `data:image/webp;base64,${bytes.toString("base64")}`)
    .catch(() => null);
  return logoHref;
}

/** Printable QR sticker of the caller's own venue. Owners and managers only. */
export async function GET(request: Request) {
  const enabled = isVenueLicencePublicEnabled();
  if (!enabled) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const result = await handleVenueStickerDownload({
    enabled,
    userId: user?.id ?? null,
    searchParams: new URL(request.url).searchParams,
    reader: createVenueStickerReader(supabase),
    logoHref: await stickerLogoHref(),
  });
  if (result.status !== 200) {
    return new NextResponse(null, { status: result.status, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse(result.svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
