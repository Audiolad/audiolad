import {
  AuthorAccessError,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import { requireAuthorPromotionAccess } from "@/lib/promotion/access";

const PROMO_PAGE_DETAIL_SELECT = `
  id,
  author_id,
  internal_name,
  slug,
  status,
  public_title,
  public_description,
  banner_path,
  footer_text,
  cta_enabled,
  cta_heading,
  cta_description,
  cta_label,
  cta_href,
  cta_open_in_new_tab,
  published_at,
  created_by,
  created_at,
  updated_at,
  authors!promo_pages_author_id_fkey (
    slug
  ),
  promo_page_products (
    position,
    practice_id,
    practices (
      id,
      slug,
      title,
      format,
      duration_minutes,
      status
    )
  )
`;

export async function requirePromoPageAccess(promoPageId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: page, error } = await supabase
    .from("promo_pages")
    .select(PROMO_PAGE_DETAIL_SELECT)
    .eq("id", promoPageId)
    .maybeSingle();

  if (error) {
    console.error("promo_page_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!page?.id) {
    throw new AuthorAccessError("not_found", 404);
  }

  await requireAuthorPromotionAccess(page.author_id);

  return { supabase, user, page };
}

export { PROMO_PAGE_DETAIL_SELECT };
