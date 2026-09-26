import "server-only";

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

  const supabase = createServiceRoleClient();

  if (parsed.kind === "product") {
    const { data, error } = await supabase
      .from("practices")
      .select(
        `
        id,
        slug,
        status,
        deleted_at,
        is_catalog_listed,
        catalog_visibility,
        authors!practices_author_id_fkey!inner(slug)
      `,
      )
      .eq("id", parsed.practiceId)
      .eq("status", "published")
      .is("deleted_at", null)
      .eq("is_catalog_listed", true)
      .eq("catalog_visibility", "listed")
      .maybeSingle();

    if (error || !data || typeof data.slug !== "string") return null;
    const authorSlug = relationSlug(
      (data as { authors?: RelationSlug }).authors ?? null,
    );
    const productSlug = data.slug.trim();
    if (!authorSlug || !productSlug) return null;

    return {
      kind: "product",
      practiceId: parsed.practiceId,
      authorSlug,
      productSlug,
    };
  }

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