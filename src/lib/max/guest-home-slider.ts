import type { PublicCatalogSection } from "@/lib/catalog/catalog-sections";
import type {
  CatalogAccessFilter,
  CatalogClassFilter,
} from "@/lib/catalog/listing-contract";
import { GUEST_HOME_SLIDES } from "@/lib/home/guest-slider";
import { openMaxExternalLink } from "@/lib/max/bridge";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { MEDITATION_AUTHORS_LANDING_PATH } from "@/lib/seo/meditation-authors-landing";

/** Same movement threshold as the ordinary guest slider. */
export const MAX_GUEST_SLIDE_TAP_THRESHOLD_PX = 8;

export type MaxGuestHomeCatalogAction = {
  type: "catalog";
  section: PublicCatalogSection | null;
  access: CatalogAccessFilter;
  publicationClass: CatalogClassFilter;
};

export type MaxGuestHomeSlideAction =
  | MaxGuestHomeCatalogAction
  | { type: "playlists" }
  | { type: "signup" }
  | { type: "external"; url: string };

export type MaxGuestSlidePoint = { x: number; y: number };

export type MaxGuestSlideGesture = {
  origin: MaxGuestSlidePoint | null;
  moved: boolean;
};

/**
 * Ordinary slide 01 is `/catalog?class=release`. MAX catalog already
 * accepts that publication class, so the guest banner uses it directly.
 */
const CATALOG_SLIDE_ACTIONS: Record<string, MaxGuestHomeCatalogAction> = {
  "01": {
    type: "catalog",
    section: null,
    access: "all",
    publicationClass: "release",
  },
  "02": {
    type: "catalog",
    section: null,
    access: "free",
    publicationClass: "all",
  },
  "03": {
    type: "catalog",
    section: null,
    access: "all",
    publicationClass: "all",
  },
  "05": {
    type: "catalog",
    section: null,
    access: "paid",
    publicationClass: "all",
  },
};

export function beginMaxGuestSlideGesture(
  point: MaxGuestSlidePoint,
): MaxGuestSlideGesture {
  return { origin: point, moved: false };
}

export function maxGuestSlideMovedPastTap(
  origin: MaxGuestSlidePoint,
  point: MaxGuestSlidePoint,
  thresholdPx = MAX_GUEST_SLIDE_TAP_THRESHOLD_PX,
): boolean {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return dx * dx + dy * dy > thresholdPx * thresholdPx;
}

export function moveMaxGuestSlideGesture(
  gesture: MaxGuestSlideGesture,
  point: MaxGuestSlidePoint,
): MaxGuestSlideGesture {
  if (!gesture.origin || gesture.moved) {
    return gesture;
  }

  if (!maxGuestSlideMovedPastTap(gesture.origin, point)) {
    return gesture;
  }

  return { origin: gesture.origin, moved: true };
}

export function endMaxGuestSlidePointer(
  gesture: MaxGuestSlideGesture,
): MaxGuestSlideGesture {
  return { origin: null, moved: gesture.moved };
}

/** A swipe must not activate the slide that was under the finger. */
export function maxGuestSlideClickActivates(gesture: MaxGuestSlideGesture): boolean {
  return !gesture.moved;
}

export function nearestMaxGuestSlideIndex(
  slideOffsets: readonly number[],
  scrollLeft: number,
): number {
  if (slideOffsets.length === 0) {
    return 0;
  }

  let nearest = 0;
  let nearestDist = Number.POSITIVE_INFINITY;

  for (let index = 0; index < slideOffsets.length; index += 1) {
    const dist = Math.abs(slideOffsets[index] - scrollLeft);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = index;
    }
  }

  return nearest;
}

/**
 * Slide 07 opens the ordinary authors landing outside the MAX host.
 * The URL is taken from the shared slide record and must stay on that path.
 */
export function resolveMaxGuestHomeAuthorUrl(): string | null {
  const slide = GUEST_HOME_SLIDES.find((item) => item.id === "07");
  if (!slide || slide.href !== MEDITATION_AUTHORS_LANDING_PATH) {
    return null;
  }

  if (!slide.href.startsWith("/") || slide.href.startsWith("//")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(slide.href, PRODUCTION_APP_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== PRODUCTION_APP_ORIGIN) return null;
  if (url.pathname !== MEDITATION_AUTHORS_LANDING_PATH) return null;
  if (url.username || url.password || url.search || url.hash) return null;

  return url.toString();
}

export function isMaxGuestHomeAuthorSlideUrl(url: string): boolean {
  const expected = resolveMaxGuestHomeAuthorUrl();
  return Boolean(expected) && url === expected;
}

export function openMaxGuestHomeExternalSlide(url: string): boolean {
  if (!isMaxGuestHomeAuthorSlideUrl(url)) {
    return false;
  }

  return openMaxExternalLink(url);
}

export function resolveMaxGuestHomeSlideAction(
  slideId: string,
): MaxGuestHomeSlideAction | null {
  const catalog = CATALOG_SLIDE_ACTIONS[slideId];
  if (catalog) {
    return catalog;
  }

  if (slideId === "04") {
    return { type: "playlists" };
  }

  if (slideId === "06") {
    return { type: "signup" };
  }

  if (slideId === "07") {
    const url = resolveMaxGuestHomeAuthorUrl();
    return url ? { type: "external", url } : null;
  }

  return null;
}
