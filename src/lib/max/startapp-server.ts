import "server-only";

import { resolvePublishedListedProductById } from "@/lib/mini-app/published-product-target";
import { parseMaxStartPayload, type MaxResolvedStartTarget } from "@/lib/max/startapp";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RelationSlug = { slug?: string | null } | Array<{ slug?: string | null }> | null;

function relationSlug(value: RelationSlug): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  const slug = row?.slug?.trim();
  return slug || null;
}

export async function resolveMaxStartTarget(
  payload: string | null | undefined,
): Promise<MaxResolvedStartTarget | null> {
  const parsed = parseMaxStartPayload(payload);
  if (!parsed) return null;

  if (parsed.kind === "product") {
    const found = await resolvePublishedListedProductById(parsed.practiceId);
    if (!found.ok || !found.target) return null;
    return {
      kind: "product",
      practiceId: parsed.practiceId,
      authorSlug: found.target.authorSlug,
      productSlug: found.target.productSlug,
    };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("promo_pages")
    .select(
      `
      id,
      slug,
      status,
      authors!promo_pages_author_id_fkey!inner(slug)
    `,
    )
    .eq("id", parsed.promoPageId)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data || typeof data.slug !== "string") return null;
  const authorSlug = relationSlug(
    (data as { authors?: RelationSlug }).authors ?? null,
  );
  const promoSlug = data.slug.trim();
  if (!authorSlug || !promoSlug) return null;

  return {
    kind: "promo",
    promoPageId: parsed.promoPageId,
    authorSlug,
    promoSlug,
  };
}