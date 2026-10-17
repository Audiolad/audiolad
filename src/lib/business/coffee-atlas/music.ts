import type { CoffeeAtlasShopSlug } from "./shops";

/**
 * Coffee shop → AudioLad catalogue tracks (music examples of the atlas).
 *
 * HOW TO CHANGE A TRACK (no code elsewhere, no uploads, no DB change):
 *   1. Publish the track in the AudioLad catalogue as usual.
 *   2. Open its public page: https://audiolad.ru/practice/<authorSlug>/<productSlug>
 *   3. Put those two slugs below for the shop. `label` is an optional caption
 *      (e.g. «Днём» / «Вечером»). Up to three examples per shop.
 *
 * Only published catalogue tracks are played: at render time every entry is
 * resolved against the published catalogue and played through the existing
 * AudioLad player (`/api/catalog/play`). An entry that is not published (or
 * was unpublished) is silently skipped — no fake playback, no placeholder sound.
 *
 * 17.10.2026 (Sergey): start with Jazz Relax tracks as temporary examples;
 * dedicated tracks per coffee shop will be published later and swapped in here.
 */
export type CoffeeAtlasTrackRef = {
  authorSlug: string;
  productSlug: string;
  label?: string;
};

export const COFFEE_ATLAS_MAX_TRACKS_PER_SHOP = 3;

export const COFFEE_ATLAS_MUSIC: Readonly<
  Record<CoffeeAtlasShopSlug, readonly CoffeeAtlasTrackRef[]>
> = {
  "caffe-florian": [{ authorSlug: "jazz-relax", productSlug: "italyanskiy-dzhaz" }],
  "cafe-de-flore": [{ authorSlug: "jazz-relax", productSlug: "romanticheskiy-dzhaz" }],
  "coffee-collective": [{ authorSlug: "jazz-relax", productSlug: "myagkiy-dzhaz" }],
  "fuglen-tokyo": [
    { authorSlug: "jazz-relax", productSlug: "dzhaz-dlya-otdyha", label: "Днём" },
    { authorSlug: "jazz-relax", productSlug: "dzhaz-launzh", label: "Вечером" },
  ],
  "starbucks-reserve-shanghai": [{ authorSlug: "jazz-relax", productSlug: "dzhaz-dlya-raboty" }],
  "cafe-tortoni": [{ authorSlug: "jazz-relax", productSlug: "vecherniy-dzhaz" }],
  "cafe-san-alberto": [
    { authorSlug: "jazz-relax", productSlug: "muzyka-dlya-osenney-progulki" },
  ],
  "truth-coffee-roasting": [{ authorSlug: "jazz-relax", productSlug: "dzhaz-na-saksofone" }],
  "single-o-surry-hills": [{ authorSlug: "jazz-relax", productSlug: "instrumentalnyy-dzhaz" }],
  "la-colombe": [{ authorSlug: "jazz-relax", productSlug: "dzhaz-launzh" }],
};

export function getCoffeeAtlasTrackRefs(
  shopSlug: string,
): readonly CoffeeAtlasTrackRef[] {
  const refs = (COFFEE_ATLAS_MUSIC as Record<string, readonly CoffeeAtlasTrackRef[] | undefined>)[
    shopSlug
  ];
  return (refs ?? []).slice(0, COFFEE_ATLAS_MAX_TRACKS_PER_SHOP);
}

export type CoffeeAtlasCatalogProduct = {
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
  audioCount?: number | null;
};

export type CoffeeAtlasTrack = {
  id: string;
  title: string;
  authorName: string | null;
  authorSlug: string;
  slug: string;
  href: string;
  coverUrl: string | null;
  coverImage: unknown;
  updatedAt: string | null;
  format: string | null;
  label: string | null;
};

/** Pure: keep only refs that match a published catalogue product, in config order. */
export function resolveCoffeeAtlasTracks(
  refs: readonly CoffeeAtlasTrackRef[],
  published: readonly CoffeeAtlasCatalogProduct[],
): CoffeeAtlasTrack[] {
  const resolved: CoffeeAtlasTrack[] = [];
  const seen = new Set<string>();

  for (const ref of refs.slice(0, COFFEE_ATLAS_MAX_TRACKS_PER_SHOP)) {
    const product = published.find(
      (item) => item.authorSlug === ref.authorSlug && item.slug === ref.productSlug,
    );
    if (!product || product.audioCount === 0 || seen.has(product.id)) {
      continue;
    }
    seen.add(product.id);
    resolved.push({
      id: product.id,
      title: product.title,
      authorName: product.authorName ?? null,
      authorSlug: ref.authorSlug,
      slug: product.slug,
      href: product.href,
      coverUrl: product.coverUrl,
      coverImage: product.coverImage ?? null,
      updatedAt: product.updatedAt ?? null,
      format: product.format ?? null,
      label: ref.label ?? null,
    });
  }

  return resolved;
}

export type CoffeeAtlasMusicDeps = {
  /** Published music catalogue as the guest sees it. */
  loadPublishedProducts: () => Promise<readonly CoffeeAtlasCatalogProduct[]>;
  /**
   * Same check the guest «Слушать» button triggers (`/api/catalog/play`):
   * true only when the existing player can actually start this track.
   */
  isPlayable: (track: CoffeeAtlasTrack) => Promise<boolean>;
};

/**
 * Build shop → playable examples. A track is shown only when it is published AND the
 * existing player can start it; any failure (catalogue, storage, play session) hides the
 * example instead of rendering a button that would not play.
 */
export async function buildCoffeeAtlasMusic(
  deps: CoffeeAtlasMusicDeps,
): Promise<Record<string, CoffeeAtlasTrack[]>> {
  let products: readonly CoffeeAtlasCatalogProduct[];
  try {
    products = await deps.loadPublishedProducts();
  } catch {
    return {};
  }

  const resolvedByShop = Object.keys(COFFEE_ATLAS_MUSIC).map(
    (shopSlug) =>
      [shopSlug, resolveCoffeeAtlasTracks(getCoffeeAtlasTrackRefs(shopSlug), products)] as const,
  );

  const playableById = new Map<string, Promise<boolean>>();
  const checkPlayable = (track: CoffeeAtlasTrack) => {
    let pending = playableById.get(track.id);
    if (!pending) {
      pending = deps.isPlayable(track).then(
        (ok) => ok === true,
        () => false,
      );
      playableById.set(track.id, pending);
    }
    return pending;
  };

  const result: Record<string, CoffeeAtlasTrack[]> = {};
  await Promise.all(
    resolvedByShop.map(async ([shopSlug, tracks]) => {
      const flags = await Promise.all(tracks.map(checkPlayable));
      result[shopSlug] = tracks.filter((_, index) => flags[index]);
    }),
  );

  return result;
}
