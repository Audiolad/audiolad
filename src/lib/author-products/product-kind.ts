export const PRODUCT_KIND = {
  PRACTICE: "practice",
  MUSIC: "music",
} as const;

export type ProductKind = (typeof PRODUCT_KIND)[keyof typeof PRODUCT_KIND];

export const MUSIC_USAGE_PERMISSION = {
  LISTEN_ONLY: "listen_only",
  PLATFORM_REUSE_ALLOWED: "platform_reuse_allowed",
} as const;

export type MusicUsagePermission =
  (typeof MUSIC_USAGE_PERMISSION)[keyof typeof MUSIC_USAGE_PERMISSION];

export const PRODUCT_KIND_LOCKED_AFTER_PUBLISH =
  "PRODUCT_KIND_LOCKED_AFTER_PUBLISH" as const;

export const MUSIC_RELEASE_TRACK_LABEL = "Музыкальный трек";
export const MUSIC_RELEASE_ALBUM_LABEL = "Музыкальный альбом";
export const MUSIC_KIND_LABEL = "Музыка";
export const PRACTICE_KIND_LABEL = "Аудиопрактика";

export function normalizeProductKind(
  value: string | null | undefined,
): ProductKind {
  return value === PRODUCT_KIND.MUSIC
    ? PRODUCT_KIND.MUSIC
    : PRODUCT_KIND.PRACTICE;
}

export function isMusicProductKind(
  value: string | null | undefined,
): boolean {
  return normalizeProductKind(value) === PRODUCT_KIND.MUSIC;
}

export function canChangeProductKind(publishedAt: string | null | undefined): boolean {
  return !publishedAt;
}

export function normalizeMusicUsagePermission(
  value: string | null | undefined,
): MusicUsagePermission | null {
  if (
    value === MUSIC_USAGE_PERMISSION.LISTEN_ONLY ||
    value === MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED
  ) {
    return value;
  }

  return null;
}

export function getMusicReleaseLabel(audioCount: number): string {
  return audioCount >= 2
    ? MUSIC_RELEASE_ALBUM_LABEL
    : MUSIC_RELEASE_TRACK_LABEL;
}

/** Card / page type line for music: «Музыка · Музыкальный трек». */
export function getMusicProductTypeLabel(audioCount: number): string {
  return `${MUSIC_KIND_LABEL} · ${getMusicReleaseLabel(audioCount)}`;
}

export function getProductKindLabel(kind: string | null | undefined): string {
  return isMusicProductKind(kind) ? MUSIC_KIND_LABEL : PRACTICE_KIND_LABEL;
}

export function getMusicUsagePermissionLabel(
  value: string | null | undefined,
): string | null {
  switch (normalizeMusicUsagePermission(value)) {
    case MUSIC_USAGE_PERMISSION.LISTEN_ONLY:
      return "Только для прослушивания";
    case MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED:
      return "Разрешено использование внутри АудиоЛада";
    default:
      return null;
  }
}

export function getMusicUsagePermissionDescription(
  value: string | null | undefined,
): string | null {
  switch (normalizeMusicUsagePermission(value)) {
    case MUSIC_USAGE_PERMISSION.LISTEN_ONLY:
      return "Музыку можно слушать в АудиоЛаде, но нельзя использовать в аудиопродуктах других авторов.";
    case MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED:
      return "В будущем другие авторы смогут добавлять голос поверх музыки и использовать её в аудиопродуктах, публикуемых внутри АудиоЛада. Исходный музыкальный файл нельзя будет распространять или продавать отдельно.";
    default:
      return null;
  }
}

export function assertMusicUsagePermissionForKind(
  productKind: string | null | undefined,
  musicUsagePermission: string | null | undefined,
):
  | { ok: true; permission: MusicUsagePermission | null }
  | { ok: false; code: string; message: string } {
  const kind = normalizeProductKind(productKind);

  if (kind === PRODUCT_KIND.PRACTICE) {
    if (
      musicUsagePermission != null &&
      String(musicUsagePermission).trim() !== ""
    ) {
      return {
        ok: false,
        code: "music_usage_not_allowed_for_practice",
        message:
          "Условия использования музыки недоступны для аудиопрактики.",
      };
    }

    return { ok: true, permission: null };
  }

  const permission = normalizeMusicUsagePermission(musicUsagePermission);

  if (!permission) {
    return {
      ok: false,
      code: "missing_music_usage_permission",
      message: "Выберите условия использования музыки.",
    };
  }

  return { ok: true, permission };
}
