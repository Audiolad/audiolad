import { NextResponse } from "next/server";

import { createClientFromRequest } from "@/lib/supabase/request-client";
import { normalizeRenewalNote, type BusinessRenewalAnswer } from "@/lib/business/renewal-choice";

export const dynamic = "force-dynamic";

function readAnswer(value: unknown): BusinessRenewalAnswer | null {
  return value === "yes" || value === "no" ? value : null;
}

/** The signed-in account reads its own yes/no. The note is not returned. */
export async function GET(request: Request) {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase.rpc("business_access_renewal_choice_for_caller");
  if (error) {
    return NextResponse.json({ answer: null });
  }
  const row = Array.isArray(data) ? data[0] : data;
  const answer = row && typeof row === "object" ? readAnswer((row as { answer?: unknown }).answer) : null;
  return NextResponse.json({ answer });
}

/** Login is required. The link itself carries no token. */
export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { answer?: unknown; note?: unknown } | null;
  const answer = readAnswer(body?.answer);
  if (!answer) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const note = typeof body?.note === "string" ? normalizeRenewalNote(body.note) : null;
  const { data, error } = await supabase.rpc("set_business_access_renewal_choice", {
    p_answer: answer,
    p_note: note,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("support_mode_consent_forbidden")) {
      return NextResponse.json({ error: "support_mode_consent_forbidden" }, { status: 403 });
    }
    if (message.includes("not_authenticated")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    answer: row && typeof row === "object" ? readAnswer((row as { answer?: unknown }).answer) : answer,
  });
}
