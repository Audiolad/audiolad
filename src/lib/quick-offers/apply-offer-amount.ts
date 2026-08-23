import type { SupabaseClient } from "@supabase/supabase-js";

import { mapRpcErrorMessage } from "@/lib/orders/create-order-api";
import { resolveServerOfferWindowExpiresAt } from "@/lib/quick-offers/offer-window-token";

export type AppliedOfferAmount = {
  amount_minor: number;
  price_minor_snapshot?: number;
};

export async function applyServerQuickOfferAmount(input: {
  supabase: SupabaseClient;
  orderId: string;
  quickOfferId: string;
  cookieHeader: string | null | undefined;
}): Promise<
  | { ok: true; amount: AppliedOfferAmount }
  | { ok: false; status: number; error: string }
> {
  const windowExpiresAt = resolveServerOfferWindowExpiresAt({
    offerId: input.quickOfferId,
    cookieHeader: input.cookieHeader,
  });

  const { data, error } = await input.supabase.rpc("apply_quick_offer_amount", {
    p_order_id: input.orderId,
    p_quick_offer_id: input.quickOfferId,
    p_window_expires_at: windowExpiresAt,
  });

  if (error) {
    const mapped = mapRpcErrorMessage(error.message);

    if (mapped.status >= 500) {
      console.error("apply_quick_offer_amount_error", error.message);
    }

    return { ok: false, status: mapped.status, error: mapped.error };
  }

  const priced =
    data && typeof data === "object"
      ? (data as { amount_minor?: number; price_minor_snapshot?: number })
      : null;

  if (typeof priced?.amount_minor !== "number") {
    return { ok: false, status: 500, error: "internal_error" };
  }

  return {
    ok: true,
    amount: {
      amount_minor: priced.amount_minor,
      price_minor_snapshot: priced.price_minor_snapshot,
    },
  };
}
