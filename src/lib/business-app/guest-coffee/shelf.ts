/**
 * a8240527 — resolve the curated shelf against the live catalogue. Pure (deps injected),
 * unit-tested; the server wiring lives in load.server.ts.
 */
import {
  GUEST_COFFEE_SHELF,
  type GuestCoffeePlaylist,
  type GuestCoffeeShelfRef,
  type GuestCoffeeTrack,
} from "./catalog";

export type GuestCoffeeCatalogProduct = {
  id: string;
  title: string;
  slug: string;
  authorSlug?: string | null;
  authorName?: string | null;
  href: string;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
  format?: string | null;
  isFree: boolean;
  audioCount?: number | null;
};

export type GuestCoffeeShelfDeps = {
  /** Published music catalogue as an anonymous guest sees it. */
  loadPublishedProducts: () => Promise<readonly GuestCoffeeCatalogProduct[]>;
  /**
   * Tracks a guest can play IN FULL through the existing listen-session loader
   * (null = not playable for a guest, e.g. preview-only / no audio / error).
   */
  loadFullTracks: (ref: { authorSlug: string; productSlug: string }) => Promise<GuestCoffeeTrack[] | null>;
};

export async function buildGuestCoffeeShelf(
  deps: GuestCoffeeShelfDeps,
  shelf: readonly GuestCoffeeShelfRef[] = GUEST_COFFEE_SHELF,
): Promise<GuestCoffeePlaylist[]> {
  let products: readonly GuestCoffeeCatalogProduct[];
  try {
    products = await deps.loadPublishedProducts();
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const candidates: { ref: GuestCoffeeShelfRef; product: GuestCoffeeCatalogProduct }[] = [];
  for (const ref of shelf) {
    const product = products.find((p) => p.authorSlug === ref.authorSlug && p.slug === ref.productSlug);
    // Only FREE published albums: a guest hears full tracks, never a paid product's preview.
    if (!product || !product.isFree || product.audioCount === 0 || seen.has(product.id)) continue;
    seen.add(product.id);
    candidates.push({ ref, product });
  }
  const resolved = await Promise.all(
    candidates.map(async ({ ref, product }) => {
      let tracks: GuestCoffeeTrack[] | null = null;
      try {
        tracks = await deps.loadFullTracks({ authorSlug: ref.authorSlug, productSlug: ref.productSlug });
      } catch {
        tracks = null;
      }
      if (!tracks || tracks.length === 0) return null;
      const playlist: GuestCoffeePlaylist = {
        id: product.id,
        authorSlug: ref.authorSlug,
        productSlug: ref.productSlug,
        title: product.title,
        authorName: product.authorName ?? null,
        href: product.href,
        coverUrl: product.coverUrl,
        coverImage: product.coverImage ?? null,
        updatedAt: product.updatedAt ?? null,
        format: product.format ?? null,
        direction: ref.direction,
        ...(ref.sounds ? { sounds: ref.sounds } : {}),
        dayparts: ref.dayparts,
        characters: ref.characters,
        tracks,
      };
      return playlist;
    }),
  );
  return resolved.filter((p): p is GuestCoffeePlaylist => p !== null);
}
