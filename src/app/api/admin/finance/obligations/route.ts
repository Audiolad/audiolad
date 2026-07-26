import { NextResponse } from "next/server";

import {
  requireAuthorFinanceCapability,
  requireAuthorFinanceViewActor,
} from "@/lib/admin/author-finance-route-guard";
import {
  processDueFinanceObligations,
  processFinanceObligation,
} from "@/lib/payments/author-finance/finance-rpc";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireAuthorFinanceViewActor();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("finance_obligations")
    .select(
      "id, obligation_type, subject_type, subject_id, author_id, status, result_code, attempts, next_retry_at, processed_at, created_at, last_error, is_test",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("admin_finance_obligations_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(
    { total: count ?? 0, rows: data ?? [], capabilities: guard.capabilities },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Manual drain of the finance outbox. Obligations that parked for review (a
 * missing rate, for example) settle here once the blocker is resolved.
 */
export async function POST(request: Request) {
  const guard = await requireAuthorFinanceCapability("canManageLedger");
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (typeof body.obligationId === "string" && body.obligationId !== "") {
    const result = await processFinanceObligation(body.obligationId);
    if (!result) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    return NextResponse.json(
      { result },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const limitInput = Number(body.limit);
  const limit =
    Number.isInteger(limitInput) && limitInput > 0
      ? Math.min(limitInput, 500)
      : 50;

  const batch = await processDueFinanceObligations(limit);
  if (!batch) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(
    { batch },
    { headers: { "Cache-Control": "no-store" } },
  );
}
