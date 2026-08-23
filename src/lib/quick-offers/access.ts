import {
  AuthorAccessError,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import {
  requireAuthorPromotionAccess,
  requireAuthorPromotionMutationAccess,
} from "@/lib/promotion/access";

export const QUICK_OFFER_DETAIL_SELECT = `
  id,
  author_id,
  practice_id,
  title,
  slug,
  hero_image_path,
  short_description,
  promo_price,
  cta_text,
  timer_duration_seconds,
  status,
  template_key,
  mid_cta_after_count,
  published_at,
  created_by,
  created_at,
  updated_at,
  practices (
    id,
    slug,
    title,
    status,
    is_free,
    price,
    author_id
  ),
  quick_offer_materials (
    id,
    offer_id,
    image_path,
    format_label,
    sort_order,
    created_at,
    updated_at
  )
`;

export async function requireQuickOfferAccess(offerId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: offer, error } = await supabase
    .from("quick_offers")
    .select(QUICK_OFFER_DETAIL_SELECT)
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    console.error("quick_offer_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!offer?.id) {
    throw new AuthorAccessError("not_found", 404);
  }

  await requireAuthorPromotionAccess(offer.author_id);

  return { supabase, user, offer };
}

export async function requireQuickOfferMutationAccess(offerId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: offer, error } = await supabase
    .from("quick_offers")
    .select(QUICK_OFFER_DETAIL_SELECT)
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    console.error("quick_offer_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!offer?.id) {
    throw new AuthorAccessError("not_found", 404);
  }

  await requireAuthorPromotionMutationAccess(offer.author_id);

  return { supabase, user, offer };
}

export { QUICK_OFFER_DETAIL_SELECT as QUICK_OFFER_SELECT };
