import "server-only";

import {
  getAuthorAppreciationRolloutConfig,
  isAuthorAppreciationRolloutEnabled,
} from "@/lib/author-appreciation/config";
import { hasAcceptedCurrentAppreciationTerms } from "@/lib/author-appreciation/current-terms";
import {
  resolveAuthorAppreciationVisibility,
  type AppreciationProductFacts,
  type AuthorAppreciationSettings,
} from "@/lib/author-appreciation/effective-visibility";

/**
 * Ordinary product-page appreciation visibility.
 * Rollout, current terms, author settings, and product override stay here
 * so MAX does not grow a second decision.
 */
export async function isPublicPracticeAppreciationVisible(input: {
  authorId: string;
  accessStatus: string | null | undefined;
  settings?: Partial<AuthorAppreciationSettings> | null;
  product: AppreciationProductFacts;
}): Promise<boolean> {
  const rollout = getAuthorAppreciationRolloutConfig();
  if (!isAuthorAppreciationRolloutEnabled(rollout)) {
    return false;
  }

  const currentTermsAccepted = await hasAcceptedCurrentAppreciationTerms(
    input.authorId,
  );

  return resolveAuthorAppreciationVisibility({
    surface: "product",
    currentTermsAccepted,
    accessStatus: input.accessStatus,
    settings: input.settings,
    product: input.product,
  });
}
