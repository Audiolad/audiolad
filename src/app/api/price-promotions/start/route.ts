import { NextResponse } from "next/server";

import { resolveValidatedNextPath } from "@/lib/auth/routes";
import { parseJsonObject } from "@/lib/orders/create-order-api";
import { ensurePriceVisitorId, isPriceVisitorId } from "@/lib/pricing/visitor";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type StartRpcRow = {
  practice_id: string;
  promotion_id: string;
  started_at: string;
  expires_at: string;
  sale_price: number;
  reused: boolean;
};

function mapStartError(message: string): { status: number; error: string } {
  const normalized = message.toLowerCase();

  if (normalized.includes("visitor_id_required")) {
    return { status: 400, error: "invalid_request" };
  }

  if (normalized.includes("start_token_required")) {
    return { status: 400, error: "invalid_request" };
  }

  if (
    normalized.includes("promotion_not_found") ||
    normalized.includes("promotion_not_startable")
  ) {
    return { status: 404, error: "promotion_not_found" };
  }

  return { status: 500, error: "internal_error" };
}

async function startPromotion(request: Request, token: string) {
  const visitorId = await ensurePriceVisitorId();
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("start_practice_price_promotion", {
    p_start_token: token,
    p_visitor_id: visitorId,
    p_user_id: user?.id ?? null,
  });

  if (error) {
    return { error };
  }

  const row = (Array.isArray(data) ? data[0] : data) as StartRpcRow | undefined;

  if (!row?.promotion_id) {
    return { error: { message: "internal_error" } };
  }

  return {
    visitorId,
    start: {
      practice_id: row.practice_id,
      promotion_id: row.promotion_id,
      started_at: row.started_at,
      expires_at: row.expires_at,
      sale_price: row.sale_price,
      reused: row.reused === true,
    },
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const returnTo = resolveValidatedNextPath(url.searchParams.get("return_to")) ?? "/";

  if (!token || token.length > 64) {
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  }

  const result = await startPromotion(request, token);

  if ("error" in result && result.error) {
    const mapped = mapStartError(result.error.message);

    if (mapped.status >= 500) {
      console.error("start_practice_price_promotion_error", result.error.message);
    }
  }

  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseJsonObject(body);

  if (!parsed) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const token = typeof parsed.token === "string" ? parsed.token.trim() : "";

  if (!token || token.length > 64) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await startPromotion(request, token);

  if ("error" in result && result.error) {
    const mapped = mapStartError(result.error.message);

    if (mapped.status >= 500) {
      console.error("start_practice_price_promotion_error", result.error.message);
    }

    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  if (!("start" in result) || !result.start) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({
    start: result.start,
    visitor_id: isPriceVisitorId(result.visitorId) ? result.visitorId : null,
  });
}
