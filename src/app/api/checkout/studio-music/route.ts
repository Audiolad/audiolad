import { NextResponse } from "next/server";

import { resolveIdempotencyKey } from "@/lib/orders/create-order-api";
import { PRICE_CHANGED_MESSAGE } from "@/lib/pricing/resolve";
import { minorToRubles } from "@/lib/pricing/money";
import { formatRubles } from "@/lib/products/price-format";
import type { OrderRow } from "@/lib/payments/payment-api";
import { startTochkaCheckoutForPendingOrder } from "@/lib/payments/start-tochka-checkout";
import {
  coerceStudioMusicOrderRow,
  logStudioMusicCheckoutFailure,
  mapStudioMusicCheckoutRpcError,
  parseJsonObject,
  parseStudioMusicCheckoutRequest,
  parseStudioMusicPriceChangedDetail,
  STUDIO_MUSIC_CHECKOUT_STAGES,
  toStudioMusicCheckoutSuccessBody,
} from "@/lib/studio-music/checkout-api";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function fail(
  stage: string,
  error: string,
  status: number,
  extra?: {
    orderId?: string | null;
    practiceId?: string | null;
  },
) {
  logStudioMusicCheckoutFailure({
    stage,
    error,
    status,
    orderId: extra?.orderId,
    practiceId: extra?.practiceId,
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
    return fail(STUDIO_MUSIC_CHECKOUT_STAGES.AUTH, "unauthorized", 401);
  }

  if (authError) {
    console.error("studio_music_checkout_auth_error", authError.message);
    return fail(STUDIO_MUSIC_CHECKOUT_STAGES.AUTH, "internal_error", 500);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail(STUDIO_MUSIC_CHECKOUT_STAGES.PARSE, "invalid_request", 400);
  }

  const parsedBody = parseJsonObject(body);

  if (!parsedBody) {
    return fail(STUDIO_MUSIC_CHECKOUT_STAGES.PARSE, "invalid_request", 400);
  }

  const parsed = parseStudioMusicCheckoutRequest(parsedBody);

  if (!parsed.ok) {
    return fail(STUDIO_MUSIC_CHECKOUT_STAGES.PARSE, parsed.error, 400, {
      practiceId:
        typeof parsedBody.practiceId === "string" ? parsedBody.practiceId : null,
    });
  }

  const practiceId = parsed.value.practiceId;
  const customerEmail = user.email?.trim() ?? "";

  if (!customerEmail) {
    return fail(STUDIO_MUSIC_CHECKOUT_STAGES.PARSE, "invalid_request", 400, {
      practiceId,
    });
  }

  const idempotencyKey = resolveIdempotencyKey(
    request.headers.get("Idempotency-Key"),
  );

  if (typeof idempotencyKey !== "string") {
    return fail(STUDIO_MUSIC_CHECKOUT_STAGES.PARSE, "invalid_request", 400, {
      practiceId,
    });
  }

  const { data, error } = await supabase.rpc("create_studio_music_order", {
    p_practice_id: parsed.value.practiceId,
    p_idempotency_key: idempotencyKey,
    p_expected_amount_minor: parsed.value.expectedAmountMinor ?? null,
  });

  if (error) {
    const mapped = mapStudioMusicCheckoutRpcError(error.message);

    if (mapped.error === "price_changed") {
      const parsedDetail = parseStudioMusicPriceChangedDetail(
        (error as { details?: string | null }).details ?? error.message,
      );
      const currentMinor = parsedDetail?.current_amount_minor ?? 0;
      let currentRubLabel = "новая цена";

      try {
        currentRubLabel = formatRubles(minorToRubles(currentMinor));
      } catch {
        currentRubLabel = "новая цена";
      }

      return NextResponse.json(
        {
          error: "price_changed",
          current_amount_minor: currentMinor || null,
          listener_amount_minor: parsedDetail?.listener_amount_minor ?? null,
          base_price_minor: parsedDetail?.base_price_minor ?? null,
          promotion_price_minor: parsedDetail?.promotion_price_minor ?? null,
          promotion_id: parsedDetail?.promotion_id ?? null,
          promotion_type: parsedDetail?.promotion_type ?? null,
          message: `${PRICE_CHANGED_MESSAGE}${currentRubLabel}.`,
        },
        { status: 409 },
      );
    }

    return fail(
      STUDIO_MUSIC_CHECKOUT_STAGES.CREATE_ORDER,
      mapped.error,
      mapped.status,
      { practiceId },
    );
  }

  const orderRow = coerceStudioMusicOrderRow(
    Array.isArray(data) ? data[0] : data,
  );

  if (!orderRow) {
    console.error("studio_music_order_invalid_row");
    return fail(
      STUDIO_MUSIC_CHECKOUT_STAGES.COERCE,
      "internal_error",
      500,
      { practiceId },
    );
  }

  let serviceRoleClient;

  try {
    serviceRoleClient = createServiceRoleClient();
  } catch {
    return fail(
      STUDIO_MUSIC_CHECKOUT_STAGES.START_TOCHKA,
      "payments_not_configured",
      503,
      {
        orderId: orderRow.order_id,
        practiceId,
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
    console.error("studio_music_order_reload_error", payableError?.message);
    return fail(
      STUDIO_MUSIC_CHECKOUT_STAGES.RELOAD,
      "internal_error",
      500,
      {
        orderId: orderRow.order_id,
        practiceId,
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
    });
  }

  const paymentUrl = started.body.payment.payment_url.trim();

  if (!paymentUrl) {
    return fail(
      STUDIO_MUSIC_CHECKOUT_STAGES.PAYMENT_URL,
      "provider_checkout_failed",
      502,
      {
        orderId: orderRow.order_id,
        practiceId,
      },
    );
  }

  return NextResponse.json(
    toStudioMusicCheckoutSuccessBody({
      order: {
        ...orderRow,
        amount_minor: (payable as OrderRow).amount_minor,
      },
      paymentId: started.body.payment.id,
      paymentUrl,
    }),
    { status: started.status === 201 ? 201 : 200 },
  );
}
