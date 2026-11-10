import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAdminSaleBuyerName,
  getAdminPaymentStatusLabel,
  shouldNotifyPlatformOwnerOfSale,
} from "@/lib/admin/sales";
import { sendPlatformOwnerSaleEmail } from "@/lib/email/send-platform-owner-sale-email";
import {
  BUSINESS_SUBSCRIPTION_ORDER_KIND,
  savedBusinessReceiptEmail,
} from "@/lib/business/subscription-checkout";
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
  order_kind?: string | null;
};

type OwnerSaleAuthUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Buyer name and email for the sale email (t1344u). `profiles` is filled for regular
 * accounts; a guest-start АудиоЛад Бизнес owner has no account email and keeps the name in
 * auth user_metadata (first_name / last_name) and the receipt email in
 * user_metadata.receipt_email (t1343u). Profile values win; auth fills the gaps.
 */
export function resolveOwnerSaleBuyer(input: {
  profileFullName: string | null | undefined;
  profileEmail: string | null | undefined;
  authUser: OwnerSaleAuthUser | null;
}): { buyerName: string; buyerEmail: string | null } {
  const meta = input.authUser?.user_metadata ?? null;
  const metaName = [metaString(meta, "first_name"), metaString(meta, "last_name")].filter(Boolean).join(" ")
    || metaString(meta, "full_name");
  const buyerEmail = input.profileEmail?.trim()
    || input.authUser?.email?.trim()
    || savedBusinessReceiptEmail(meta)
    || null;
  const fullName = input.profileFullName?.trim() || metaName || null;
  return { buyerName: buildAdminSaleBuyerName(fullName, buyerEmail), buyerEmail };
}

async function loadOwnerSaleAuthUser(supabase: SupabaseClient, userId: string): Promise<OwnerSaleAuthUser | null> {
  try {
    const admin = (supabase as { auth?: { admin?: SupabaseClient["auth"]["admin"] } }).auth?.admin;
    if (!admin) return null;
    const { data, error } = await admin.getUserById(userId);
    if (error || !data?.user) return null;
    return { email: data.user.email ?? null, user_metadata: data.user.user_metadata ?? null };
  } catch {
    return null;
  }
}

/** АудиоЛад Бизнес: the organization of the paying owner instead of «Автор» (t1344u). */
async function loadOwnerSaleOrganizationName(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data: member } = await supabase
      .from("business_organization_members")
      .select("organization_id, created_at")
      .eq("user_id", userId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const organizationId = (member as { organization_id?: string } | null)?.organization_id;
    if (!organizationId) return null;
    const { data: org } = await supabase
      .from("business_organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();
    return (org as { name?: string | null } | null)?.name?.trim() || null;
  } catch {
    return null;
  }
}

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
        "id, user_id, status, practice_title_snapshot, author_id_snapshot, paid_at, checkout_origin_path, order_kind",
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
    const isBusiness = orderRow.order_kind === BUSINESS_SUBSCRIPTION_ORDER_KIND;
    const needsAuthUser = isBusiness || !buyer?.email?.trim() || !buyer?.full_name?.trim();
    const [authUser, organizationName] = await Promise.all([
      needsAuthUser ? loadOwnerSaleAuthUser(supabase, orderRow.user_id) : Promise.resolve(null),
      isBusiness ? loadOwnerSaleOrganizationName(supabase, orderRow.user_id) : Promise.resolve(null),
    ]);
    const { buyerName, buyerEmail } = resolveOwnerSaleBuyer({
      profileFullName: buyer?.full_name ?? null,
      profileEmail: buyer?.email ?? null,
      authUser,
    });

    const result = await send({
      paymentId: paymentRow.id,
      orderId: orderRow.id,
      productTitle,
      authorName: author?.name ?? null,
      // Business has no author: the line shows the organization, or is left out.
      ...(isBusiness ? { authorLabel: "Заведение", authorName: organizationName } : {}),
      amountMinor: paymentRow.amount_minor,
      currency: paymentRow.currency,
      buyerName,
      buyerEmail,
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
