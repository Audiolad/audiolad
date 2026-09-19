import {
  MUSIC_USAGE_PERMISSION,
  isMusicProductKind,
  type MusicUsagePermission,
} from "@/lib/author-products/product-kind";
import { isAuthorCommercialActiveAccess } from "@/lib/authors/access";
import {
  STUDIO_MUSIC_COMMERCIAL_REQUIRED,
  STUDIO_MUSIC_COMMERCIAL_REQUIRED_MESSAGE,
} from "@/lib/studio-music/commercial-author";
import {
  DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
  MIN_STUDIO_MUSIC_PRICE_RUBLES,
  STUDIO_MUSIC_PRICING_MODE,
  type StudioMusicPricingMode,
} from "@/lib/studio-music/pricing";
import { isEffectiveStudioFreeProduct } from "@/lib/studio-music/new-free-policy";

export const STUDIO_MUSIC_MANAGEMENT_ERROR = {
  COMMERCIAL_REQUIRED: STUDIO_MUSIC_COMMERCIAL_REQUIRED,
  NOT_MUSIC: "studio_music_not_music",
  NOT_PUBLISHED: "studio_music_not_published",
  INVALID_PRICE: "studio_music_invalid_price",
  NEW_FREE_DISABLED: "studio_new_free_disabled",
  FORBIDDEN: "forbidden",
} as const;

export type AuthorStudioMusicListItem = {
  practiceId: string;
  title: string;
  slug: string;
  coverUrl: string | null;
  coverImage: unknown;
  status: string;
  moderationStatus: string | null;
  trackCount: number;
  kindLabel: string;
  listenerIsFree: boolean;
  listenerPriceRubles: number;
  inStudio: boolean;
  studioPricingMode: StudioMusicPricingMode | null;
  studioPriceRubles: number | null;
  grandfatheredFree: boolean;
  published: boolean;
};

export type AuthorStudioMusicListResponse = {
  accessStatus: string;
  canManageStudio: boolean;
  items: AuthorStudioMusicListItem[];
  inStudioCount: number;
  notInStudioCount: number;
};

export function buildStudioEnableFields(input: {
  priceRubles?: number | null;
}): {
  ok: true;
  music_usage_permission: MusicUsagePermission;
  studio_music_pricing_mode: typeof STUDIO_MUSIC_PRICING_MODE.FIXED;
  studio_music_price_minor: number;
} | {
  ok: false;
  code: string;
  message: string;
} {
  const rubles =
    input.priceRubles == null || input.priceRubles === undefined
      ? DEFAULT_STUDIO_MUSIC_FIXED_RUBLES
      : input.priceRubles;
  if (
    !Number.isInteger(rubles) ||
    rubles < MIN_STUDIO_MUSIC_PRICE_RUBLES ||
    rubles > 100000
  ) {
    return {
      ok: false,
      code: STUDIO_MUSIC_MANAGEMENT_ERROR.INVALID_PRICE,
      message: `Цена лицензии для Студии — от ${MIN_STUDIO_MUSIC_PRICE_RUBLES} ₽.`,
    };
  }
  return {
    ok: true,
    music_usage_permission: MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED,
    studio_music_pricing_mode: STUDIO_MUSIC_PRICING_MODE.FIXED,
    studio_music_price_minor: rubles * 100,
  };
}

export function buildStudioDisableFields() {
  return {
    music_usage_permission: MUSIC_USAGE_PERMISSION.LISTEN_ONLY,
    studio_music_pricing_mode: null as null,
    studio_music_price_minor: null as null,
  };
}

export function isStudioParticipationEnabled(practice: {
  music_usage_permission?: string | null;
}): boolean {
  return (
    practice.music_usage_permission ===
    MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED
  );
}

export function assertCanEnableStudioMusic(input: {
  accessStatus: string;
  productKind: string | null | undefined;
  status: string | null | undefined;
}): { ok: true } | { ok: false; code: string; message: string; status: number } {
  if (!isAuthorCommercialActiveAccess(input.accessStatus)) {
    return {
      ok: false,
      code: STUDIO_MUSIC_COMMERCIAL_REQUIRED,
      message: STUDIO_MUSIC_COMMERCIAL_REQUIRED_MESSAGE,
      status: 403,
    };
  }
  if (!isMusicProductKind(input.productKind)) {
    return {
      ok: false,
      code: STUDIO_MUSIC_MANAGEMENT_ERROR.NOT_MUSIC,
      message: "В Студию можно добавить только музыкальный продукт.",
      status: 400,
    };
  }
  if (input.status !== "published") {
    return {
      ok: false,
      code: STUDIO_MUSIC_MANAGEMENT_ERROR.NOT_PUBLISHED,
      message: "Сначала опубликуйте продукт.",
      status: 400,
    };
  }
  return { ok: true };
}

export function mapPracticeToStudioMusicListItem(input: {
  practice: {
    id: string;
    title: string;
    slug: string;
    cover_url: string | null;
    cover_image?: unknown;
    status: string;
    moderation_status: string | null;
    is_free: boolean;
    price: number;
    music_usage_permission: string | null;
    studio_music_pricing_mode: string | null;
    studio_music_price_minor: number | null;
    deleted_at?: string | null;
  };
  trackCount: number;
  kindLabel: string;
}): AuthorStudioMusicListItem {
  const p = input.practice;
  const inStudio = isStudioParticipationEnabled(p);
  const grandfatheredFree = isEffectiveStudioFreeProduct({
    deleted_at: p.deleted_at ?? null,
    music_usage_permission: p.music_usage_permission,
    studio_music_pricing_mode: p.studio_music_pricing_mode,
    is_free: p.is_free,
    price: p.price,
  });
  const mode =
    p.studio_music_pricing_mode === "free" ||
    p.studio_music_pricing_mode === "fixed" ||
    p.studio_music_pricing_mode === "auto_2x_listener"
      ? (p.studio_music_pricing_mode as StudioMusicPricingMode)
      : null;
  const studioPriceRubles =
    mode === "fixed" &&
    p.studio_music_price_minor != null &&
    Number.isFinite(p.studio_music_price_minor)
      ? Math.trunc(p.studio_music_price_minor / 100)
      : null;

  return {
    practiceId: p.id,
    title: p.title,
    slug: p.slug,
    coverUrl: p.cover_url,
    coverImage: p.cover_image ?? null,
    status: p.status,
    moderationStatus: p.moderation_status,
    trackCount: input.trackCount,
    kindLabel: input.kindLabel,
    listenerIsFree: p.is_free === true,
    listenerPriceRubles: p.is_free ? 0 : p.price,
    inStudio,
    studioPricingMode: mode,
    studioPriceRubles,
    grandfatheredFree: grandfatheredFree && inStudio,
    published: p.status === "published",
  };
}
