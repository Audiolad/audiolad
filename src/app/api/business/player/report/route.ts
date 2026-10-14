import { NextResponse } from "next/server";

import { loadSpaPilotContext } from "@/lib/business-app/spa-pilot";
import { handleSpaReport, isSameOriginJsonRequest, spaReportHttpStatus } from "@/lib/business-app/spa-player-report";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Stable (build-independent) /spa live report endpoint. See spa-player-report.ts. */
export async function POST(request: Request) {
  if (!isSameOriginJsonRequest(request.headers)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 4096) return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 413, headers: NO_STORE });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const result = await handleSpaReport(body, {
    loadPlayerId: async () => (await loadSpaPilotContext())?.playerId ?? null,
    rpc: async (fn, args) => {
      const supabase = await createClient();
      const { error } = await supabase.rpc(fn, args);
      return { error };
    },
  });
  return NextResponse.json(result, { status: spaReportHttpStatus(result), headers: NO_STORE });
}
