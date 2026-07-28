import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAuthorOnboardingChecklistState } from "@/lib/author-dashboard/load-onboarding-state";
import {
  buildAuthorOpportunitiesView,
  type AuthorOpportunitiesViewModel,
} from "@/lib/author-dashboard/opportunities";
import type { AuthorAccessStatus } from "@/lib/authors/access";

async function authorHasPromoPage(
  supabase: SupabaseClient,
  authorId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("promo_pages")
    .select("id")
    .eq("author_id", authorId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("author_opportunities_promo_page_exists_error", error.message);
    return false;
  }

  return Boolean(data?.id);
}

async function authorHasPersonalMaterial(
  supabase: SupabaseClient,
  authorId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("personal_materials")
    .select("id")
    .eq("author_id", authorId)
    .neq("status", "deleted")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "author_opportunities_personal_material_exists_error",
      error.message,
    );
    return false;
  }

  return Boolean(data?.id);
}

export async function loadAuthorOpportunitiesView(input: {
  supabase: SupabaseClient;
  authorId: string;
  authorSlug: string;
  accessStatus: AuthorAccessStatus;
}): Promise<AuthorOpportunitiesViewModel> {
  const { supabase, authorId, authorSlug, accessStatus } = input;

  const [checklist, hasPromoPage, hasPersonalMaterial] = await Promise.all([
    loadAuthorOnboardingChecklistState(supabase, {
      authorId,
      authorSlug,
      accessStatus,
    }),
    authorHasPromoPage(supabase, authorId),
    authorHasPersonalMaterial(supabase, authorId),
  ]);

  return buildAuthorOpportunitiesView({
    authorId,
    authorSlug,
    accessStatus,
    checklist,
    hasPromoPage,
    hasPersonalMaterial,
  });
}
