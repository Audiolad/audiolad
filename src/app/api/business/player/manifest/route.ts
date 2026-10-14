import { NextResponse } from "next/server";

import { fetchSpaManifestRaw, loadSpaPilotContext } from "@/lib/business-app/spa-pilot";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Stable (build-independent) manifest refresh for an open /spa tab across deploys. */
export async function GET() {
  const ctx = await loadSpaPilotContext();
  if (!ctx) return NextResponse.json({ ok: false, reason: "no_access" }, { headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await fetchSpaManifestRaw(ctx) }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, reason: "manifest_failed" }, { headers: NO_STORE });
  }
}
