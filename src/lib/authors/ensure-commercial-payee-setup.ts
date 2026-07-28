import "server-only";

import {
  AUTHOR_COMMERCIAL_SHARE_BPS,
} from "@/lib/author-commercial/economics";
import { createAuthorCommercialTermsDraft } from "@/lib/payments/author-finance/terms-rpc";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const DEFAULT_COMMERCIAL_HOLD_DAYS = 14;
export const COMMERCIAL_PAYEE_SETUP_NOTES =
  "default_after_author_terms_accepted";

export type EnsureCommercialPayeeSetupResult = {
  payoutEligible: boolean;
  termsProvisioned: boolean;
  alreadyReady: boolean;
};

/**
 * After Author Terms acceptance, a commercial_active author must be able to
 * accrue. Ledger accrual still requires payout_eligible + approved
 * author_commercial_terms (share/hold). This helper provisions the platform
 * defaults idempotently and does not touch payout profile.
 */
export async function ensureCommercialPayeeSetupAfterTerms(input: {
  authorId: string;
  actorUserId: string;
  validFrom?: string;
}): Promise<EnsureCommercialPayeeSetupResult> {
  const supabase = createServiceRoleClient();

  const { data: author, error: authorError } = await supabase
    .from("authors")
    .select("id, access_status, payout_eligible")
    .eq("id", input.authorId)
    .maybeSingle();

  if (authorError || !author?.id) {
    console.error(
      "ensure_commercial_payee_setup_author_error",
      authorError?.message,
    );
    return {
      payoutEligible: false,
      termsProvisioned: false,
      alreadyReady: false,
    };
  }

  const accessStatus = String(author.access_status ?? "");
  if (
    accessStatus !== "commercial_active" &&
    accessStatus !== "commercial"
  ) {
    return {
      payoutEligible: author.payout_eligible === true,
      termsProvisioned: false,
      alreadyReady: false,
    };
  }

  const { count: approvedTermsCount, error: termsCountError } = await supabase
    .from("author_commercial_terms")
    .select("id", { count: "exact", head: true })
    .eq("author_id", input.authorId)
    .eq("status", "approved");

  if (termsCountError) {
    console.error(
      "ensure_commercial_payee_setup_terms_count_error",
      termsCountError.message,
    );
    return {
      payoutEligible: author.payout_eligible === true,
      termsProvisioned: false,
      alreadyReady: false,
    };
  }

  let termsProvisioned = false;
  if ((approvedTermsCount ?? 0) === 0) {
    const created = await createAuthorCommercialTermsDraft({
      authorId: input.authorId,
      authorShareBps: AUTHOR_COMMERCIAL_SHARE_BPS,
      validFrom: input.validFrom ?? new Date().toISOString(),
      holdDays: DEFAULT_COMMERCIAL_HOLD_DAYS,
      notes: COMMERCIAL_PAYEE_SETUP_NOTES,
      actorUserId: input.actorUserId,
      correlationId: `author_terms_payee_setup:${input.authorId}`,
      approveImmediately: true,
    });
    termsProvisioned = created.ok === true;
    if (!created.ok) {
      console.error(
        "ensure_commercial_payee_setup_terms_create_failed",
        created.error,
      );
    }
  }

  let payoutEligible = author.payout_eligible === true;
  if (!payoutEligible) {
    const { error: eligibilityError } = await supabase
      .from("authors")
      .update({ payout_eligible: true })
      .eq("id", input.authorId);

    if (eligibilityError) {
      console.error(
        "ensure_commercial_payee_setup_eligibility_error",
        eligibilityError.message,
      );
    } else {
      payoutEligible = true;
    }
  }

  const alreadyReady =
    author.payout_eligible === true && (approvedTermsCount ?? 0) > 0;

  return {
    payoutEligible,
    termsProvisioned,
    alreadyReady,
  };
}
