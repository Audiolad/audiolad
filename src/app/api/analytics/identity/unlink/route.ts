import { NextResponse } from "next/server";

import { createClientFromRequest } from "@/lib/supabase/request-client";

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const { data, error } = await supabase.rpc("unlink_analytics_identity");

  if (error) {
    console.error("analytics_identity_unlink_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ result: data ?? null }, { status: 200 });
}
