import { redirect } from "next/navigation";

import {
  buildBusinessSubscriptionPaidHref,
  buildBusinessSubscriptionSignInHref,
} from "@/lib/payments/checkout-result-cta";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lands here after sign-in from a business payment. Opens the cabinet, does not issue a gift. */
export default async function BusinessCabinetPaymentReturnPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildBusinessSubscriptionSignInHref());
  }

  redirect(buildBusinessSubscriptionPaidHref());
}
