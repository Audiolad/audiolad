import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAdminSaleBuyerName,
  getAdminPaymentStatusLabel,
  shouldNotifyPlatformOwnerOfSale,
} from "@/lib/admin/sales";
import { sendPlatformOwnerSaleEmail } from "@/lib/email/send-platform-owner-sale-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type OwnerSalePaymentRow = {
  id: string;
  order_id: string;
  status: string;
  amount_minor: number;
  currency: string;
  confirmed_at: string | null;
  created_at: string;
  is_test?: boolean | null;
};

type OwnerSaleOrderRow = {
  id: string;
  user_id: string;
  status: string;
  practice_title_snapshot: string | null;
  author_id_snapshot: string | null;
  paid_at: string | null;
  checkout_origin_path: string | null;
};

/**
 * Notify the platform owner after a payment is actually confirmed.
 * Failures are isolated: checkout, access grant and the purchase always continue.
 */
export async function notifyPlatformOwnerOfConfirmedSale(input: {
  paymentId: string;
  orderId: string;
  supabase?: SupabaseClient;
  send?: typeof sendPlatformOwnerSaleEmail;
}): Promise<void> {
  try {
    const supabase = input.supabase ?? createServiceRoleClient();
    const send = input.send ?? sendPlatformOwnerSaleEmail;

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(
        "id, order_id, status, amount_minor, currency, confirmed_at, created_at, is_test",
      )
      .eq("id", input.paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      console.error("platform_owner_sale_notify_payment_load_error");
      return;
    }

    const paymentRow = payment as OwnerSalePaymentRow;

    if (
      !shouldNotifyPlatformOwnerOfSale({
        ok: true,
        paymentStatus: paymentRow.status,
        isTest: paymentRow.is_test === true,
        paymentId: paymentRow.id,
        orderId: paymentRow.order_id,
      })
    ) {
      return;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, user_id, status, practice_title_snapshot, author_id_snapshot, paid_at, checkout_origin_path",
      )
      .eq("id", input.orderId)
      .maybeSingle();

    if (orderError || !order) {
      console.error("platform_owner_sale_notify_order_load_error");
      return;
    }

    const orderRow = order as OwnerSaleOrderRow;

    const [{ data: buyer }, { data: author }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", orderRow.user_id)
        .maybeSingle(),
      orderRow.author_id_snapshot
        ? supabase
            .from("authors")
            .select("id, name")
            .eq("id", orderRow.author_id_snapshot)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const paidAt =
      paymentRow.confirmed_at ?? orderRow.paid_at ?? paymentRow.created_at;
    const productTitle = orderRow.practice_title_snapshot?.trim() || "Продукт";
    const buyerName = buildAdminSaleBuyerName(
      buyer?.full_name ?? null,
      buyer?.email ?? null,
    );

    const result = await send({
      paymentId: paymentRow.id,
      orderId: orderRow.id,
      productTitle,
      authorName: author?.name ?? null,
      amountMinor: paymentRow.amount_minor,
      currency: paymentRow.currency,
      buyerName,
      buyerEmail: buyer?.email ?? null,
      paidAt,
      paymentStatus: getAdminPaymentStatusLabel(paymentRow.status),
      checkoutOriginPath: orderRow.checkout_origin_path,
      supabase,
    });

    if (!result.ok) {
      console.error("platform_owner_sale_notify_send_failed", result.code);
    }
  } catch (error) {
    console.error(
      "platform_owner_sale_notify_unexpected_error",
      error instanceof Error ? error.name : "unknown",
    );
  }
}
