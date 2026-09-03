import "server-only";

import { isAppreciationCurrentTermsSatisfied } from "@/lib/authors/owner-controlled";
import { hasAcceptedCurrentAuthorTerms } from "@/lib/author-terms/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Current Author Terms (DB is_current), not a hardcoded version label.
 * Fail closed: lookup errors hide the CTA and reject checkout.
 *
 * Owner-controlled / auto-commercial workspaces use the existing
 * `can_bypass_product_moderation` distinction and do not require a
 * separate stored self-acceptance of the same platform-authored terms.
 * Ordinary external commercial authors still require acceptance.
 */
export async function hasAcceptedCurrentAppreciationTerms(
  authorId: string,
): Promise<boolean> {
  try {
    const { accepted } = await hasAcceptedCurrentAuthorTerms(authorId);
    if (accepted) return true;

    const service = createServiceRoleClient();
    const { data, error } = await service
      .from("authors")
      .select("can_bypass_product_moderation")
      .eq("id", authorId)
      .maybeSingle();
    if (error) return false;
    return isAppreciationCurrentTermsSatisfied({
      currentTermsAccepted: false,
      ownerControlled: data?.can_bypass_product_moderation === true,
    });
  } catch {
    return false;
  }
}
