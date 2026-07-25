import { NextResponse } from "next/server";

import { sanitizeCheckoutOriginPath } from "@/lib/analytics/checkout-origin";
import {
  extractOrderAnalyticsClaims,
  extractPracticeSlug,
  mapRpcErrorMessage,
  parseJsonObject,
  resolveIdempotencyKey,
  toCreateOrderSuccessBody,
  type CreateOrderRpcRow,
} from "@/lib/orders/create-order-api";
import { createClientFromRequest } from "@/lib/supabase/request-client";

function truncateId(value: string | null | undefined): string | null {
  if (!value) return null;
  return `${value.slice(0, 8)}…`;
}

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("create_order_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsedBody = parseJsonObject(body);

  if (!parsedBody) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const practiceSlug = extractPracticeSlug(parsedBody);

  if (!practiceSlug) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const idempotencyKey = resolveIdempotencyKey(
    request.headers.get("Idempotency-Key"),
  );

  if (typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const claims = extractOrderAnalyticsClaims(
    parsedBody,
    sanitizeCheckoutOriginPath,
  );

  if (
    typeof parsedBody.checkout_origin_path === "string" &&
    parsedBody.checkout_origin_path.trim() &&
    claims.checkoutOriginPath &&
    parsedBody.checkout_origin_path.includes("?")
  ) {
    console.info(
      JSON.stringify({
        event: "attribution_origin_sanitized",
        practice_slug: practiceSlug,
      }),
    );
  }

  const { data, error } = await supabase.rpc("create_practice_order", {
    p_practice_slug: practiceSlug,
    p_idempotency_key: idempotencyKey,
    p_analytics_session_id: claims.analyticsSessionId,
    p_analytics_anonymous_id: claims.analyticsAnonymousId,
    p_checkout_origin_path: claims.checkoutOriginPath,
    p_buy_click_client_event_id: claims.buyClickClientEventId,
  });

  if (error) {
    const mapped = mapRpcErrorMessage(error.message);

    if (mapped.status >= 500) {
      console.error("create_order_rpc_error", error.message);
    }

    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | CreateOrderRpcRow
    | undefined;

  if (!row?.order_id) {
    console.error("create_order_rpc_empty_result");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const confidence = row.attribution_confidence ?? "unknown";
  if (confidence === "exact") {
    console.info(
      JSON.stringify({
        event: "attribution_snapshot_exact",
        order_id: truncateId(row.order_id),
        session_id: truncateId(claims.analyticsSessionId),
      }),
    );
  } else {
    const reason =
      !claims.analyticsSessionId || !claims.analyticsAnonymousId
        ? "missing_claims"
        : "validation_failed_or_unknown";
    console.info(
      JSON.stringify({
        event: "attribution_snapshot_unknown",
        order_id: truncateId(row.order_id),
        reason,
        session_id: truncateId(claims.analyticsSessionId),
      }),
    );
  }

  if (row.buy_click_linked) {
    console.info(
      JSON.stringify({
        event: "buy_click_linked_to_order",
        order_id: truncateId(row.order_id),
        client_event_id: truncateId(claims.buyClickClientEventId),
      }),
    );
  } else {
    const reason = row.buy_click_link_reason ?? "unlinked";
    const reasonEvent =
      reason === "event_missing" || reason === "missing_client_event_id"
        ? "buy_click_missing"
        : reason === "invalid_event_type"
          ? "buy_click_invalid_event"
          : reason === "session_mismatch" || reason === "missing_order_session"
            ? "buy_click_session_mismatch"
            : reason === "practice_mismatch"
              ? "buy_click_practice_mismatch"
              : reason === "identity_mismatch"
                ? "buy_click_identity_mismatch"
                : reason === "stale_click"
                  ? "buy_click_stale"
                  : reason === "already_linked" ||
                      reason === "already_linked_preserved"
                    ? "buy_click_already_linked"
                    : "buy_click_missing";
    console.info(
      JSON.stringify({
        event: reasonEvent,
        order_id: truncateId(row.order_id),
        reason,
        client_event_id: truncateId(claims.buyClickClientEventId),
      }),
    );
  }

  if (confidence === "exact") {
    console.info(
      JSON.stringify({
        event: "buy_click_snapshot_preserved",
        order_id: truncateId(row.order_id),
        attribution_confidence: confidence,
      }),
    );
  }

  return NextResponse.json(toCreateOrderSuccessBody(row), { status: 201 });
}
