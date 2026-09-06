import { AUDIO_POST_KIND_LABEL } from "@/lib/author-products/product-kind";
import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";

/** Internal select value for «Свой формат…» — never shown to users in UI. */
export const CUSTOM_FORMAT_VALUE = "__custom__";

export const CUSTOM_FORMAT_LABEL = "Свой формат…";

export const LEGACY_OTHER_FORMAT = "Другое";

export const PRODUCT_PRESET_FORMATS = [
  "Аудиопрактика",
  "Медитация",
  "Энергетическая практика",
  "Визуализация",
  "Звук",
  "Авторский аудиоподкаст",
  "Лекция",
  "Программа аудиопрактик",
  "Аудиокурс",
  "Цикл практик",
  "Сборник",
  "Аудиокнига",
] as const;

/**
 * Author-facing display labels for audio_post only.
 * Stored in practices.format. Never a product_kind / publication_class value.
 */
export const AUDIO_POST_PRESET_FORMATS = [
  AUDIO_POST_KIND_LABEL,
  "Аудиоэфир",
] as const;

export const AUDIO_POST_CUSTOM_TYPE_LABEL = "Другое";
export const AUDIO_POST_CUSTOM_TYPE_FIELD_LABEL = "Название типа продукта";
export const AUDIO_POST_CUSTOM_TYPE_PLACEHOLDER =
  "Например: Аудиолекция, Разбор, Мастер-класс";

export type AudioPostPresetFormat = (typeof AUDIO_POST_PRESET_FORMATS)[number];

/** Compact music presets for practices.format when product_kind = music. */
export const MUSIC_PRESET_FORMATS = [
  "Музыкальный трек",
  "Музыкальный альбом",
  "Медитативная музыка",
] as const;

export type ProductPresetFormat = (typeof PRODUCT_PRESET_FORMATS)[number];
export type MusicPresetFormat = (typeof MUSIC_PRESET_FORMATS)[number];

const PRESET_FORMAT_SET = new Set<string>([
  ...PRODUCT_PRESET_FORMATS,
  ...MUSIC_PRESET_FORMATS,
]);

export function isPresetFormat(value: string | null | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  return PRESET_FORMAT_SET.has(value.trim());
}

export function parsePracticeFormat(format: string | null | undefined): {
  preset: string;
  customFormat: string;
} {
  const trimmed = typeof format === "string" ? format.trim() : "";

  if (!trimmed || trimmed === LEGACY_OTHER_FORMAT) {
    return {
      preset: trimmed === LEGACY_OTHER_FORMAT ? CUSTOM_FORMAT_VALUE : "",
      customFormat: "",
    };
  }

  if (isPresetFormat(trimmed)) {
    return {
      preset: trimmed,
      customFormat: "",
    };
  }

  return {
    preset: CUSTOM_FORMAT_VALUE,
    customFormat: trimmed,
  };
}

export function resolveFormatForStorage(
  preset: string,
  customFormat: string,
): string | null {
  if (!preset) {
    return null;
  }

  if (preset === CUSTOM_FORMAT_VALUE) {
    const trimmed = customFormat.trim();

    return trimmed || null;
  }

  return preset.trim() || null;
}

const AUDIO_POST_PRESET_FORMAT_SET = new Set<string>(AUDIO_POST_PRESET_FORMATS);

export function isAudioPostPresetFormat(
  value: string | null | undefined,
): value is AudioPostPresetFormat {
  if (!value?.trim()) {
    return false;
  }

  return AUDIO_POST_PRESET_FORMAT_SET.has(value.trim());
}

/** Strip markup so a custom type stays a plain display label. */
export function sanitizeStoredFormatLabel(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAudioPostFormat(format: string | null | undefined): {
  preset: string;
  customFormat: string;
} {
  const trimmed = sanitizeStoredFormatLabel(
    typeof format === "string" ? format : "",
  );

  if (!trimmed) {
    return {
      preset: AUDIO_POST_KIND_LABEL,
      customFormat: "",
    };
  }

  if (trimmed === LEGACY_OTHER_FORMAT) {
    return {
      preset: CUSTOM_FORMAT_VALUE,
      customFormat: "",
    };
  }

  if (isAudioPostPresetFormat(trimmed)) {
    return {
      preset: trimmed,
      customFormat: "",
    };
  }

  return {
    preset: CUSTOM_FORMAT_VALUE,
    customFormat: trimmed,
  };
}

export type AudioPostFormatStorageResult =
  | { ok: true; format: string }
  | {
      ok: false;
      error: "missing_custom_format" | "custom_format_too_long";
    };

/**
 * Persist the author-chosen audio-post display label.
 * product_kind stays audio_post; empty «Другое» must not save.
 */
export function resolveAudioPostFormatForStorage(
  preset: string,
  customFormat: string,
): AudioPostFormatStorageResult {
  const selected = preset.trim() || AUDIO_POST_KIND_LABEL;

  if (
    selected === CUSTOM_FORMAT_VALUE ||
    selected === LEGACY_OTHER_FORMAT
  ) {
    const sanitized = sanitizeStoredFormatLabel(customFormat);

    if (!sanitized || sanitized === LEGACY_OTHER_FORMAT) {
      return { ok: false, error: "missing_custom_format" };
    }

    if (sanitized.length > PRODUCT_CONTENT_LIMITS.customFormat) {
      return { ok: false, error: "custom_format_too_long" };
    }

    return { ok: true, format: sanitized };
  }

  if (isAudioPostPresetFormat(selected)) {
    return { ok: true, format: selected };
  }

  const sanitized = sanitizeStoredFormatLabel(selected);

  if (!sanitized || sanitized === LEGACY_OTHER_FORMAT) {
    return { ok: true, format: AUDIO_POST_KIND_LABEL };
  }

  if (sanitized.length > PRODUCT_CONTENT_LIMITS.customFormat) {
    return { ok: false, error: "custom_format_too_long" };
  }

  return { ok: true, format: sanitized };
}

export function normalizeAudioPostStoredFormat(
  value: string | null | undefined,
):
  | { ok: true; format: string | null }
  | { ok: false; error: "missing_custom_format" | "custom_format_too_long" } {
  if (value == null) {
    return { ok: true, format: null };
  }

  const sanitized = sanitizeStoredFormatLabel(value);

  if (!sanitized) {
    return { ok: true, format: null };
  }

  if (
    sanitized === LEGACY_OTHER_FORMAT ||
    sanitized === CUSTOM_FORMAT_VALUE
  ) {
    return { ok: false, error: "missing_custom_format" };
  }

  if (sanitized.length > PRODUCT_CONTENT_LIMITS.customFormat) {
    return { ok: false, error: "custom_format_too_long" };
  }

  return { ok: true, format: sanitized };
}

/** Public chip/label for audio posts. Empty/legacy format stays «Аудиопост». */
export function getAudioPostDisplayLabel(
  format: string | null | undefined,
): string {
  return getDisplayFormat(format) ?? AUDIO_POST_KIND_LABEL;
}

/** Uppercase format line on product cards (rails, catalog, library, etc.). */
export const PRODUCT_FORMAT_LINE_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]";

/** Public label for cards, pages, and author dashboard lists. */
export function getDisplayFormat(format: string | null | undefined): string | null {
  const trimmed = typeof format === "string" ? format.trim() : "";

  if (!trimmed || trimmed === LEGACY_OTHER_FORMAT) {
    return null;
  }

  return trimmed;
}

export function isCustomFormatSelection(preset: string): boolean {
  return preset === CUSTOM_FORMAT_VALUE;
}

export function validateCustomFormatForPublish(
  preset: string,
  customFormat: string,
): boolean {
  if (!isCustomFormatSelection(preset)) {
    return true;
  }

  return customFormat.trim().length > 0;
}
