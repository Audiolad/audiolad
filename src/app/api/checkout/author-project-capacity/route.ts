import { NextResponse } from "next/server";

import {
  AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES,
  coerceAuthorProjectCapacityOrderRow,
  logAuthorProjectCapacityCheckoutFailure,
  mapAuthorProjectCapacityRpcError,
  parseAuthorProjectCapacityCheckoutRequest,
  parseJsonObject,
  toAuthorProjectCapacitySuccessBody,
} from "@/lib/author-projects/capacity-checkout-api";
import { resolveIdempotencyKey } from "@/lib/orders/create-order-api";
import { isPaymentsConfigured } from "@/lib/payments/is-configured";
import type { OrderRow } from "@/lib/payments/payment-api";
import { startTochkaCheckoutForPendingOrder } from "@/lib/payments/start-tochka-checkout";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function fail(
  stage: string,
  error: string,
  status: number,
  extra?: { orderId?: string | null; sku?: string | null },
) {
  logAuthorProjectCapacityCheckoutFailure({
    stage,
    error,
    status,
    orderId: extra?.orderId,
    sku: extra?.sku,
  });
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.AUTH, "unauthorized", 401);
  }

  if (authError) {
    console.error("author_project_capacity_checkout_auth_error", authError.message);
    return fail(AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.AUTH, "internal_error", 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.PARSE, "invalid_request", 400);
  }

  const parsedBody = parseJsonObject(body);
  if (!parsedBody) {
    return fail(AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.PARSE, "invalid_request", 400);
  }

  const parsed = parseAuthorProjectCapacityCheckoutRequest(parsedBody);
  if (!parsed.ok) {
    return fail(AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.PARSE, parsed.error, 400);
  }

  const customerEmail = user.email?.trim() ?? "";
  if (!customerEmail) {
    return fail(AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.PARSE, "invalid_request", 400, {
      sku: parsed.value.sku,
    });
  }

  if (!isPaymentsConfigured()) {
    return fail(
      AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.PAYMENTS,
      "payments_not_configured",
      503,
      { sku: parsed.value.sku },
    );
  }

  const idempotencyKey = resolveIdempotencyKey(
    request.headers.get("Idempotency-Key"),
  );
  if (typeof idempotencyKey !== "string") {
    return fail(AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.PARSE, "invalid_request", 400, {
      sku: parsed.value.sku,
    });
  }

  const { data, error } = await supabase.rpc(
    "create_author_project_capacity_order",
    {
      p_sku: parsed.value.sku,
      p_idempotency_key: idempotencyKey,
    },
  );

  if (error) {
    const mapped = mapAuthorProjectCapacityRpcError(error.message);
    return fail(
      AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.CREATE_ORDER,
      mapped.error,
      mapped.status,
      { sku: parsed.value.sku },
    );
  }

  const orderRow = coerceAuthorProjectCapacityOrderRow(
    Array.isArray(data) ? data[0] : data,
  );

  if (!orderRow) {
    console.error("author_project_capacity_order_invalid_row");
    return fail(
      AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.CREATE_ORDER,
      "internal_error",
      500,
      { sku: parsed.value.sku },
    );
  }

  let serviceRoleClient;
  try {
    serviceRoleClient = createServiceRoleClient();
  } catch {
    return fail(
      AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.START_TOCHKA,
      "payments_not_configured",
      503,
      { orderId: orderRow.order_id, sku: parsed.value.sku },
    );
  }

  const { data: payable, error: payableError } = await serviceRoleClient
    .from("orders")
    .select(
      "id, user_id, practice_id, status, amount_minor, currency, practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, created_at, paid_at, order_kind",
    )
    .eq("id", orderRow.order_id)
    .maybeSingle();

  if (payableError || !payable) {
    console.error(
      "author_project_capacity_order_reload_error",
      payableError?.message,
    );
    return fail(
      AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.START_TOCHKA,
      "internal_error",
      500,
      { orderId: orderRow.order_id, sku: parsed.value.sku },
    );
  }

  const started = await startTochkaCheckoutForPendingOrder({
    orderRow: {
      ...(payable as OrderRow),
      practice_id: (payable as { practice_id?: string | null }).practice_id ?? "",
    },
    userId: user.id,
    customerEmail,
    serviceRoleClient,
  });

  if (!started.ok) {
    return fail(
      started.stage || AUTHOR_PROJECT_CAPACITY_CHECKOUT_STAGES.START_TOCHKA,
      started.error,
      started.status,
      { orderId: orderRow.order_id, sku: parsed.value.sku },
    );
  }

  return NextResponse.json(
    toAuthorProjectCapacitySuccessBody({
      order: orderRow,
      paymentId: started.body.payment.id,
      paymentStatus: started.body.payment.status,
      paymentUrl: started.body.payment.payment_url,
    }),
    { status: 200 },
  );
}
