import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  assertCommercialShareBpsPair,
  type CommercialShareBps,
} from "@/lib/author-commercial/economics";

export type AuthorApprovedCommercialTermsShare = CommercialShareBps & {
  termsId: string;
  holdDays: number;
  validFrom: string;
  validTo: string | null;
};

/**
 * Current approved commercial revenue share for an author, if any.
 * Display / status-page use only — does not change ledger calculations.
 */
export async function getCurrentApprovedAuthorCommercialShare(
  authorId: string,
): Promise<AuthorApprovedCommercialTermsShare | null> {
  const supabase = createServiceRoleClient();
  const now = Date.now();

  const { data, error } = await supabase
    .from("author_commercial_terms")
    .select(
      "id, author_share_bps, platform_fee_bps, hold_days, valid_from, valid_to, status",
    )
    .eq("author_id", authorId)
    .eq("status", "approved")
    .order("valid_from", { ascending: false })
    .limit(20);

  if (error) {
    console.error("author_current_commercial_terms_error", error.message);
    return null;
  }

  const row = (data ?? []).find((item) => {
    const validFrom = new Date(String(item.valid_from ?? "")).getTime();
    if (!Number.isFinite(validFrom) || validFrom > now) {
      return false;
    }
    if (item.valid_to == null) {
      return true;
    }
    const validTo = new Date(String(item.valid_to)).getTime();
    return Number.isFinite(validTo) && validTo > now;
  });

  if (!row) {
    return null;
  }

  const authorShareBps = Number(row.author_share_bps);
  const platformShareBps = Number(row.platform_fee_bps);

  if (!assertCommercialShareBpsPair(authorShareBps, platformShareBps)) {
    return null;
  }

  return {
    termsId: String(row.id),
    authorShareBps,
    platformShareBps,
    holdDays: Number(row.hold_days) || 0,
    validFrom: String(row.valid_from ?? ""),
    validTo:
      row.valid_to === null || row.valid_to === undefined
        ? null
        : String(row.valid_to),
  };
}
