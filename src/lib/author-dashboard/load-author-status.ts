import "server-only";

import { authorHasPublishedFreeProductForCommercialGate } from "@/lib/author-commercial-applications/free-product-gate";
import { getAuthorCommercialApplication } from "@/lib/author-commercial-applications/queries";
import { getCurrentApprovedAuthorCommercialShare } from "@/lib/author-commercial/current-terms";
import {
  resolveAuthorStatusView,
  type AuthorStatusViewModel,
} from "@/lib/author-dashboard/author-status";
import type { AuthorAccessStatus } from "@/lib/authors/access";
import type { AuthorPayoutProfileStatus } from "@/lib/author-payout-profiles/types";
import { hasAcceptedCurrentAuthorTerms } from "@/lib/author-terms/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadAuthorAppreciationSettings } from "@/lib/author-appreciation/settings";

async function loadPayoutProfileSummary(authorId: string): Promise<{
  status: AuthorPayoutProfileStatus | null;
  reviewComment: string | null;
}> {
  try {
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("author_payout_profiles")
      .select("status, review_comment")
      .eq("author_id", authorId)
      .maybeSingle();

    if (error || !data) {
      return { status: null, reviewComment: null };
    }

    return {
      status: (data.status as AuthorPayoutProfileStatus) ?? null,
      reviewComment: (data.review_comment as string | null) ?? null,
    };
  } catch {
    return { status: null, reviewComment: null };
  }
}

export async function loadAuthorStatusView(input: {
  authorId: string;
  authorSlug: string;
  accessStatus: AuthorAccessStatus;
  role: "owner" | "editor";
}): Promise<AuthorStatusViewModel> {
  const supabase = createServiceRoleClient();

  const [application, payout, termsAcceptance, individualShare, hasPublishedFreeProduct, appreciationSettings] =
    await Promise.all([
      getAuthorCommercialApplication(supabase, input.authorId).catch(() => null),
      loadPayoutProfileSummary(input.authorId),
      hasAcceptedCurrentAuthorTerms(input.authorId),
      getCurrentApprovedAuthorCommercialShare(input.authorId),
      authorHasPublishedFreeProductForCommercialGate(supabase, input.authorId),
      loadAuthorAppreciationSettings(supabase, input.authorId),
    ]);

  return resolveAuthorStatusView({
    accessStatus: input.accessStatus,
    applicationStatus: application?.status ?? null,
    applicationSubmittedAt: application?.submitted_at ?? null,
    applicationReviewComment: application?.review_comment ?? null,
    termsAccepted: termsAcceptance.accepted,
    publishedTermsAvailable: Boolean(termsAcceptance.currentVersion),
    payoutProfileStatus: payout.status,
    payoutReviewComment: payout.reviewComment,
    individualShare: individualShare
      ? {
          authorShareBps: individualShare.authorShareBps,
          platformShareBps: individualShare.platformShareBps,
        }
      : null,
    role: input.role,
    authorSlug: input.authorSlug,
    hasPublishedFreeProduct,
    appreciationSettings,
  });
}
