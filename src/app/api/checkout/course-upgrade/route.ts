import { NextResponse } from "next/server";

import {
  coerceCourseUpgradeOrderRow,
  mapCourseUpgradeRpcError,
  parseCourseUpgradeRequest,
  parseJsonObject,
  toCourseUpgradeSuccessBody,
} from "@/lib/course-content/course-upgrade-order-api";
import {
  COURSE_UPGRADE_CHECKOUT_STAGES,
  logCourseUpgradeFailure,
} from "@/lib/course-content/course-upgrade-stages";
import { resolveIdempotencyKey } from "@/lib/orders/create-order-api";
import { startTochkaCheckoutForPendingOrder } from "@/lib/payments/start-tochka-checkout";
import type { OrderRow } from "@/lib/payments/payment-api";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function fail(
  stage: string,
  error: string,
  status: number,
  extra?: {
    orderId?: string | null;
    practiceId?: string | null;
    targetAccessLevel?: number | null;
  },
) {
  logCourseUpgradeFailure({
    stage,
    error,
    status,
    orderId: extra?.orderId,
    practiceId: extra?.practiceId,
    targetAccessLevel: extra?.targetAccessLevel,
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
    return fail(COURSE_UPGRADE_CHECKOUT_STAGES.AUTH, "unauthorized", 401);
  }

  if (authError) {
    console.error("course_upgrade_auth_error", authError.message);
    return fail(COURSE_UPGRADE_CHECKOUT_STAGES.AUTH, "internal_error", 500);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail(COURSE_UPGRADE_CHECKOUT_STAGES.PARSE, "invalid_request", 400);
  }

  const parsedBody = parseJsonObject(body);

  if (!parsedBody) {
    return fail(COURSE_UPGRADE_CHECKOUT_STAGES.PARSE, "invalid_request", 400);
  }

  const parsed = parseCourseUpgradeRequest(parsedBody);

  if (!parsed.ok) {
    return fail(COURSE_UPGRADE_CHECKOUT_STAGES.PARSE, parsed.error, 400, {
      practiceId: typeof parsedBody.practiceId === "string" ? parsedBody.practiceId : null,
    });
  }

  const practiceId = parsed.value.practiceId;
  const targetAccessLevel = parsed.value.targetAccessLevel ?? null;
  const customerEmail = user.email?.trim() ?? "";

  if (!customerEmail) {
    return fail(COURSE_UPGRADE_CHECKOUT_STAGES.PARSE, "invalid_request", 400, {
      practiceId,
      targetAccessLevel,
    });
  }

  const idempotencyKey = resolveIdempotencyKey(
    request.headers.get("Idempotency-Key"),
  );

  if (typeof idempotencyKey !== "string") {
    return fail(COURSE_UPGRADE_CHECKOUT_STAGES.PARSE, "invalid_request", 400, {
      practiceId,
      targetAccessLevel,
    });
  }

  const { data, error } = await supabase.rpc("create_course_upgrade_order", {
    p_practice_id: parsed.value.practiceId,
    p_idempotency_key: idempotencyKey,
    p_expected_target_access_level: parsed.value.targetAccessLevel ?? null,
  });

  if (error) {
    const mapped = mapCourseUpgradeRpcError(error.message);
    return fail(
      COURSE_UPGRADE_CHECKOUT_STAGES.CREATE_ORDER,
      mapped.error,
      mapped.status,
      { practiceId, targetAccessLevel },
    );
  }

  const orderRow = coerceCourseUpgradeOrderRow(
    Array.isArray(data) ? data[0] : data,
  );

  if (!orderRow) {
    console.error("course_upgrade_order_invalid_row");
    return fail(
      COURSE_UPGRADE_CHECKOUT_STAGES.COERCE,
      "internal_error",
      500,
      { practiceId, targetAccessLevel },
    );
  }

  let serviceRoleClient;

  try {
    serviceRoleClient = createServiceRoleClient();
  } catch {
    return fail(
      COURSE_UPGRADE_CHECKOUT_STAGES.START_TOCHKA,
      "payments_not_configured",
      503,
      {
        orderId: orderRow.order_id,
        practiceId,
        targetAccessLevel: orderRow.target_access_level,
      },
    );
  }

  const { data: payable, error: payableError } = await serviceRoleClient
    .from("orders")
    .select(
      "id, user_id, practice_id, status, amount_minor, currency, practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, created_at, paid_at, order_kind, target_access_level",
    )
    .eq("id", orderRow.order_id)
    .maybeSingle();

  if (payableError || !payable) {
    console.error("course_upgrade_order_reload_error", payableError?.message);
    return fail(
      COURSE_UPGRADE_CHECKOUT_STAGES.RELOAD,
      "internal_error",
      500,
      {
        orderId: orderRow.order_id,
        practiceId,
        targetAccessLevel: orderRow.target_access_level,
      },
    );
  }

  const started = await startTochkaCheckoutForPendingOrder({
    orderRow: payable as OrderRow,
    userId: user.id,
    customerEmail,
    serviceRoleClient,
  });

  if (!started.ok) {
    return fail(started.stage, started.error, started.status, {
      orderId: orderRow.order_id,
      practiceId,
      targetAccessLevel: orderRow.target_access_level,
    });
  }

  const paymentUrl = started.body.payment.payment_url.trim();

  if (!paymentUrl) {
    return fail(
      COURSE_UPGRADE_CHECKOUT_STAGES.PAYMENT_URL,
      "provider_checkout_failed",
      502,
      {
        orderId: orderRow.order_id,
        practiceId,
        targetAccessLevel: orderRow.target_access_level,
      },
    );
  }

  return NextResponse.json(
    toCourseUpgradeSuccessBody({
      order: orderRow,
      paymentId: started.body.payment.id,
      paymentUrl,
    }),
    { status: started.status === 201 ? 201 : 200 },
  );
}
