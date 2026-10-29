/**
 * a8240527 — resolve the guest coffee shelf against the live catalogue. Pure (deps injected),
 * unit-tested; the server wiring lives in load.server.ts.
 *
 * Sergey 29.10.2026: the shelf holds ONLY music admitted to AudioLad Business for cafés – the
 * same source of truth as the venue cabinet (business_content_admissions → the per-track gate
 * business_sound_allowed_tracks(…, 'cafe')). Every free, published album of an admitted artist
 * or album is a candidate (not only the hand-tagged ones), each track is checked by the gate,
 * not admitted tracks are dropped. Any gate failure = an empty shelf (fail closed). The
 * curated GUEST_COFFEE_SHELF only gives editorial tags; other admitted albums get tags derived
 * from their title (the reserve basis – the sound passports rank them first).
 */
import {
  GUEST_COFFEE_SHELF,
  type GuestCoffeeCharacter,
  type GuestCoffeeDaypart,
  type GuestCoffeeDirection,
  type GuestCoffeeEditorialStyle,
  type GuestCoffeePlaylist,
  type GuestCoffeeShelfRef,
  type GuestCoffeeTrack,
} from "./catalog";

/** AudioLad Business direction of the guest coffee funnel. */
export const GUEST_COFFEE_BUSINESS_DIRECTION = "cafe";

export type GuestCoffeeCatalogProduct = {
  id: string;
  title: string;
  slug: string;
  authorSlug?: string | null;
  authorId?: string | null;
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
  /**
   * Allowed admissions of the café direction (business_content_admissions): artists and albums.
   * Only narrows the candidates; the per-track gate below is authoritative.
   */
  loadAdmissions: () => Promise<{ authorIds: ReadonlySet<string>; practiceIds: ReadonlySet<string> }>;
  /** Fresh per-track gate: the ids (of the given ones) admitted for cafés. Throws on failure. */
  admittedTrackIds: (audioItemIds: readonly string[]) => Promise<ReadonlySet<string>>;
};

type EditorialTags = Pick<GuestCoffeeShelfRef, "direction" | "sounds" | "dayparts" | "characters">;

const has = (title: string, re: RegExp) => re.test(title);

/**
 * Editorial reserve tags of an admitted album that is not hand-tagged in GUEST_COFFEE_SHELF,
 * derived from words of its own title («Вечерний джаз», «Фоновая музыка lo fi»…).
 */
export function inferGuestCoffeeEditorialTags(rawTitle: string): EditorialTags {
  const title = rawTitle.toLowerCase().replace(/ё/g, "е");
  const direction: GuestCoffeeEditorialStyle = has(title, /саксофон|лаунж|lounge/)
    ? "sax"
    : has(title, /босса|bossa/)
      ? "bossa"
      : has(title, /джаз|jazz/)
        ? "jazz"
        : "calm";
  const sounds: GuestCoffeeDirection[] = [];
  if (has(title, /мягк|спокойн|отдых|релакс|для сна|дожд/)) sounds.push("calm");
  if (has(title, /романтич|фортепиано|пианино|классическ|мелод/)) sounds.push("melodic");
  if (has(title, /lo ?fi|лоу ?фай|ритм|бодр|кальян/)) sounds.push("rhythm");
  const dayparts: Exclude<GuestCoffeeDaypart, "allday">[] = [];
  if (has(title, /утр/)) dayparts.push("morning");
  if (has(title, /работ|офис|учеб|концентрац|творчеств|чтени|ресторан|отел|кафе|кофейн|прогулк|lo ?fi|лоу ?фай/)) dayparts.push("day");
  if (has(title, /вечер|полночн|для сна|кальян|романтич/)) dayparts.push("evening");
  const characters: GuestCoffeeCharacter[] = [];
  if (has(title, /уютн|отдых|релакс|осенн|чтени|мягк|для сна|дожд/)) characters.push("cozy");
  if (has(title, /работ|офис|учеб|концентрац|творчеств|lo ?fi|лоу ?фай|прогулк/)) characters.push("city");
  if (has(title, /ресторан|отел|итальян|француз|классическ|инструментальн/)) characters.push("classic");
  if (has(title, /вечер|полночн|кальян|романтич|лаунж/)) characters.push("evening");
  return {
    direction,
    ...(sounds.length > 0 ? { sounds } : {}),
    dayparts: dayparts.length > 0 ? dayparts : ["day"],
    characters: characters.length > 0 ? characters : ["cozy"],
  };
}

export async function buildGuestCoffeeShelf(
  deps: GuestCoffeeShelfDeps,
  shelf: readonly GuestCoffeeShelfRef[] = GUEST_COFFEE_SHELF,
): Promise<GuestCoffeePlaylist[]> {
  let products: readonly GuestCoffeeCatalogProduct[];
  let admissions: Awaited<ReturnType<GuestCoffeeShelfDeps["loadAdmissions"]>>;
  try {
    [products, admissions] = await Promise.all([deps.loadPublishedProducts(), deps.loadAdmissions()]);
  } catch {
    return [];
  }
  const tagsOf = new Map(shelf.map((ref, i) => [`${ref.authorSlug}/${ref.productSlug}`, { ref, i }]));
  const seen = new Set<string>();
  const candidates: { authorSlug: string; tags: EditorialTags; order: number; product: GuestCoffeeCatalogProduct }[] = [];
  for (const product of products) {
    const authorSlug = product.authorSlug ?? "";
    // Only FREE published albums: a guest hears full tracks, never a paid product's preview.
    if (!authorSlug || !product.isFree || product.audioCount === 0 || seen.has(product.id)) continue;
    // Only albums admitted for cafés by artist or by album (the track gate decides finally).
    const admitted = admissions.practiceIds.has(product.id) || (product.authorId != null && admissions.authorIds.has(product.authorId));
    if (!admitted) continue;
    seen.add(product.id);
    const curated = tagsOf.get(`${authorSlug}/${product.slug}`);
    candidates.push({
      authorSlug,
      product,
      tags: curated?.ref ?? inferGuestCoffeeEditorialTags(product.title),
      order: curated ? curated.i : shelf.length,
    });
  }
  // Deterministic: hand-tagged albums in shelf order, then the others by artist / album slug.
  candidates.sort(
    (a, b) =>
      a.order - b.order ||
      a.authorSlug.localeCompare(b.authorSlug) ||
      a.product.slug.localeCompare(b.product.slug),
  );
  const resolved = await Promise.all(
    candidates.map(async ({ authorSlug, tags, product }) => {
      let tracks: GuestCoffeeTrack[] | null = null;
      try {
        tracks = await deps.loadFullTracks({ authorSlug, productSlug: product.slug });
      } catch {
        tracks = null;
      }
      if (!tracks || tracks.length === 0) return null;
      const playlist: GuestCoffeePlaylist = {
        id: product.id,
        authorSlug,
        productSlug: product.slug,
        title: product.title,
        authorName: product.authorName ?? null,
        href: product.href,
        coverUrl: product.coverUrl,
        coverImage: product.coverImage ?? null,
        updatedAt: product.updatedAt ?? null,
        format: product.format ?? null,
        direction: tags.direction,
        ...(tags.sounds ? { sounds: tags.sounds } : {}),
        dayparts: tags.dayparts,
        characters: tags.characters,
        tracks,
      };
      return playlist;
    }),
  );
  const playable = resolved.filter((p): p is GuestCoffeePlaylist => p !== null);
  let allowed: ReadonlySet<string>;
  try {
    allowed = await deps.admittedTrackIds(playable.flatMap((p) => p.tracks.map((t) => t.audioItemId)));
  } catch {
    return [];
  }
  return playable
    .map((p) => ({ ...p, tracks: p.tracks.filter((t) => allowed.has(t.audioItemId)) }))
    .filter((p) => p.tracks.length > 0);
}

/** Different artists on a shelf (logged when it is too few for a varied atmosphere). */
export function guestCoffeeShelfArtistCount(shelf: readonly Pick<GuestCoffeePlaylist, "authorSlug">[]): number {
  return new Set(shelf.map((p) => p.authorSlug)).size;
}
