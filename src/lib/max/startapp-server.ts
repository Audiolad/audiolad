import "server-only";

import { resolvePublishedDirectLinkProductById } from "@/lib/mini-app/published-product-target";
import { createMaxPlaylistReadClient } from "@/lib/max/playlists";
import { parseMaxStartPayload, type MaxResolvedStartTarget } from "@/lib/max/startapp";
import { isValidPlaylistPublicSlug } from "@/lib/playlists/public-slug";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export { setPublishedDirectLinkLookupForTests } from "@/lib/mini-app/published-product-target";

type RelationSlug = { slug?: string | null } | Array<{ slug?: string | null }> | null;

type MaxPlaylistStartRow = {
  id: string;
  slug: string | null;
  visibility: string;
  published_at: string | null;
};

type MaxPlaylistStartLookup = (playlistId: string) => Promise<
  | { ok: true; row: MaxPlaylistStartRow | null }
  | { ok: false; reason: "storage_unavailable" }
>;

let playlistStartLookupOverride: MaxPlaylistStartLookup | null = null;

export function setMaxPlaylistStartLookupForTests(
  lookup: MaxPlaylistStartLookup | null,
) {
  playlistStartLookupOverride = lookup;
}

async function lookupMaxPlaylistStart(
  playlistId: string,
): ReturnType<MaxPlaylistStartLookup> {
  const { data, error } = await createMaxPlaylistReadClient()
    .from("playlists")
    .select("id, slug, visibility, published_at")
    .eq("id", playlistId)
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .maybeSingle();

  if (error) return { ok: false, reason: "storage_unavailable" };
  return { ok: true, row: data };
}

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
    const found = await resolvePublishedDirectLinkProductById(parsed.practiceId);
    if (!found.ok || !found.target) return null;
    return {
      kind: "product",
      practiceId: parsed.practiceId,
      authorSlug: found.target.authorSlug,
      productSlug: found.target.productSlug,
    };
  }

  if (parsed.kind === "playlist") {
    try {
      const found = await (playlistStartLookupOverride ?? lookupMaxPlaylistStart)(
        parsed.playlistId,
      );
      if (!found.ok || !found.row) return null;
      const row = found.row;
      if (
        row.id !== parsed.playlistId ||
        row.visibility !== "public" ||
        !row.published_at ||
        !isValidPlaylistPublicSlug(row.slug)
      ) {
        return null;
      }
      return {
        kind: "playlist",
        playlistId: parsed.playlistId,
        playlistSlug: row.slug.trim(),
      };
    } catch {
      return null;
    }
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
