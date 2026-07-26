import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getAdminPaymentSettlement } from "@/lib/admin/analytics-refunds-queries";
import { requireRefundsManageActor } from "@/lib/admin/refunds-route-guard";
import { createAndSubmitRefund } from "@/lib/payments/refunds/create-and-submit-refund";
import { isRefundReasonCode } from "@/lib/payments/refunds/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

const VALIDATION_ERRORS = new Set([
  "payment_not_found",
  "payment_not_succeeded",
  "payment_not_confirmed",
  "test_payment_refund_not_allowed",
  "refund_amount_exceeds_refundable",
  "no_refundable_amount",
  "amount_must_be_positive",
  "reason_code_required",
  "idempotency_key_required",
  "idempotency_key_conflict",
  "invalid_access_effect",
]);

/** Current refundable balance for the refund dialog. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireRefundsManageActor();
  if (!guard.ok) return guard.response;

  const { paymentId } = await context.params;
  const settlement = await getAdminPaymentSettlement(paymentId);

  if (!settlement || !settlement.found) {
    return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { settlement },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Variant A approval: `refunds.manage` requests and submits in one action.
 * Provider, currency, order and status are always derived server-side.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireRefundsManageActor();
  if (!guard.ok) return guard.response;

  const { paymentId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const amountMinor = body.amountMinor;
  if (typeof amountMinor !== "number" || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    return NextResponse.json(
      { error: "amount_must_be_positive_integer" },
      { status: 400 },
    );
  }

  if (!isRefundReasonCode(body.reasonCode)) {
    return NextResponse.json({ error: "invalid_reason_code" }, { status: 400 });
  }

  const reasonText =
    typeof body.reasonText === "string" && body.reasonText.trim() !== ""
      ? body.reasonText.trim().slice(0, 1000)
      : null;

  if (body.reasonCode === "other" && !reasonText) {
    return NextResponse.json({ error: "reason_text_required" }, { status: 400 });
  }

  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.trim() !== ""
      ? body.idempotencyKey.trim().slice(0, 120)
      : `admin:${paymentId}:${randomUUID()}`;

  const result = await createAndSubmitRefund({
    paymentId,
    amountMinor,
    reasonCode: body.reasonCode,
    reasonText,
    idempotencyKey,
    actorUserId: guard.actor.userId,
    correlationId: `admin-refund:${randomUUID()}`,
    allowTest: body.allowTest === true,
  });

  if (!result.ok && result.error && VALIDATION_ERRORS.has(result.error)) {
    return NextResponse.json(
      { error: result.error, settlement: result.settlement },
      { status: 409 },
    );
  }

  if (!result.ok && result.outcome === "rejected") {
    return NextResponse.json({ error: result.error ?? "refund_failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      outcome: result.outcome,
      refund: result.refund,
      settlement: result.settlement,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
