import type { CoffeeAtlasShopSlug } from "./shops";
import { selectInstrumentalForBusiness } from "../../music-analyzer-runs/vocal-eligibility.mjs";

type BusinessVocalLookup = {
  get(id: string): { value?: unknown; source?: unknown; status?: unknown } | null | undefined;
};

/**
 * Coffee shop → AudioLad catalogue track (music example of the atlas).
 *
 * Every example is ONE track (audio item) inside a published catalogue album:
 *   - `authorSlug` / `productSlug` – the album page https://audiolad.ru/practice/<authorSlug>/<productSlug>
 *   - `audioItemId` – the exact track inside that album (id of the audio item).
 * The atlas shows the track title large and the album title below it; the artist
 * name is never shown (30.10.2026, Sergey).
 *
 * Only published, playable tracks are shown: at render time every entry is
 * resolved against the published catalogue and the `/api/catalog/play` session
 * loader; a track missing from that session (unpublished, removed) is silently
 * skipped – no fake playback, no placeholder sound. The play button plays exactly
 * that one track through the existing AudioLad player.
 *
 * 30.10.2026 (Sergey): dedicated tracks per coffee shop replace the temporary
 * Jazz Relax examples of 17.10.2026.
 */
export type CoffeeAtlasTrackRef = {
  authorSlug: string;
  productSlug: string;
  audioItemId: string;
  label?: string;
};

export const COFFEE_ATLAS_MAX_TRACKS_PER_SHOP = 3;

export const COFFEE_ATLAS_MUSIC: Readonly<
  Record<CoffeeAtlasShopSlug, readonly CoffeeAtlasTrackRef[]>
> = {
  // «Вечер в маленькой траттории» – «Итальянский ресторанный джаз»
  "caffe-florian": [
    { authorSlug: "kofeynik", productSlug: "italyanskiy-restorannyy-dzhaz", audioItemId: "576ac613-b9e2-465c-9ff9-2644394bf44a" },
  ],
  // «Утро на Монмартре» – «Французский утренний джаз»
  "cafe-de-flore": [
    { authorSlug: "kofeynik", productSlug: "frantsuzskiy-utrenniy-dzhaz", audioItemId: "b81807c0-7147-437c-937c-e963437e9352" },
  ],
  // «Северное утро» – «Скандинавский джаз»
  "coffee-collective": [
    { authorSlug: "kofeynik", productSlug: "skandinavskiy-dzhaz", audioItemId: "ddda47ed-f2be-468e-ac4e-226a34e78d2f" },
  ],
  // «Старый проигрыватель» – «Винтажный джаз»
  "fuglen-tokyo": [
    { authorSlug: "jazz-relax", productSlug: "vintazhnyy-dzhaz", audioItemId: "1b698d19-c582-431e-b6d4-e40c24b6a1bf" },
  ],
  // «Ритм мегаполиса» – «Современный джаз»
  "starbucks-reserve-shanghai": [
    { authorSlug: "djazmanov", productSlug: "sovremennyy-dzhaz", audioItemId: "e40b5889-ce4b-4e16-b10d-808e623f6693" },
  ],
  // «Танго старого кафе» – «Аргентинское танго: музыка страсти»
  "cafe-tortoni": [
    { authorSlug: "jazz-relax", productSlug: "argentinskoe-tango-muzyka", audioItemId: "a7dbfb7b-f9ae-485f-9f70-d72f18d790f3" },
  ],
  // «Солнечная Картахена» – «Латиноамериканский джаз»
  "cafe-san-alberto": [
    { authorSlug: "kofeynik", productSlug: "latinoamerikanskiy-dzhaz", audioItemId: "a496b83c-4d67-45e6-b669-2b9f12e7c4f3" },
  ],
  // «Кофе в полумраке» – «Нуар джаз»
  "truth-coffee-roasting": [
    { authorSlug: "jazz-relax", productSlug: "nuar-dzhaz", audioItemId: "3a9040fb-515d-4796-a892-c919e6f0a933" },
  ],
  // «Доброе утро, Сидней» – «Лёгкий фанк»
  "single-o-surry-hills": [
    { authorSlug: "djazmanov", productSlug: "legkiy-fank", audioItemId: "7ea01dd5-9e5d-458f-9641-901c587949d3" },
  ],
  // «Рояль у окна» – «Фортепианный джаз»
  "la-colombe": [
    { authorSlug: "djazmanov", productSlug: "fortepiannyy-dzhaz", audioItemId: "8a1642df-677f-4e11-8db5-af1f5230fc9f" },
  ],
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

/** One resolved example. No artist field on purpose: the atlas never shows the artist. */
export type CoffeeAtlasTrack = {
  /** Album (catalogue product) id. */
  id: string;
  /** Exact track inside the album that the play button plays. */
  audioItemId: string;
  /** Track title (shown large). Filled from the play session; empty until resolved. */
  trackTitle: string;
  /** Album title (shown below the track title). */
  albumTitle: string;
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
  /** Automatic instrumental selection. Omitted for slug-curated examples, which do not read vocal_role. */
  vocalByProductId?: BusinessVocalLookup | null,
): CoffeeAtlasTrack[] {
  const resolved: CoffeeAtlasTrack[] = [];
  const seen = new Set<string>();

  for (const ref of refs.slice(0, COFFEE_ATLAS_MAX_TRACKS_PER_SHOP)) {
    const product = published.find(
      (item) => item.authorSlug === ref.authorSlug && item.slug === ref.productSlug,
    );
    const key = `${product?.id}:${ref.audioItemId}`;
    if (!product || !ref.audioItemId || product.audioCount === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    resolved.push({
      id: product.id,
      audioItemId: ref.audioItemId,
      trackTitle: "",
      albumTitle: product.title,
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

  if (vocalByProductId == null) return resolved;
  return selectInstrumentalForBusiness(resolved, (track) => vocalByProductId.get(track.id) ?? null);
}

export type CoffeeAtlasMusicDeps = {
  /** Published music catalogue as the guest sees it. */
  loadPublishedProducts: () => Promise<readonly CoffeeAtlasCatalogProduct[]>;
  /**
   * Same session the guest «Слушать» button loads (`/api/catalog/play`): the tracks the
   * existing player can actually start for this album. Null when it cannot start at all.
   */
  loadPlayableTracks: (
    track: CoffeeAtlasTrack,
  ) => Promise<readonly { id: string; title: string }[] | null>;
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

  const sessionByAlbum = new Map<string, Promise<readonly { id: string; title: string }[] | null>>();
  const loadTracks = (track: CoffeeAtlasTrack) => {
    let pending = sessionByAlbum.get(track.id);
    if (!pending) {
      pending = deps.loadPlayableTracks(track).then(
        (tracks) => (Array.isArray(tracks) ? tracks : null),
        () => null,
      );
      sessionByAlbum.set(track.id, pending);
    }
    return pending;
  };

  const result: Record<string, CoffeeAtlasTrack[]> = {};
  await Promise.all(
    resolvedByShop.map(async ([shopSlug, tracks]) => {
      const sessions = await Promise.all(tracks.map(loadTracks));
      const playable: CoffeeAtlasTrack[] = [];
      tracks.forEach((track, index) => {
        const item = sessions[index]?.find((entry) => entry.id === track.audioItemId);
        const trackTitle = item?.title?.trim();
        if (trackTitle) playable.push({ ...track, trackTitle });
      });
      result[shopSlug] = playable;
    }),
  );

  return result;
}
