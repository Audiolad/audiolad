/** Internal select value for «Свой формат…» — never shown to users in UI. */
export const CUSTOM_FORMAT_VALUE = "__custom__";

export const CUSTOM_FORMAT_LABEL = "Свой формат…";

export const LEGACY_OTHER_FORMAT = "Другое";

export const PRODUCT_PRESET_FORMATS = [
  "Аудиопрактика",
  "Медитация",
  "Энергетическая практика",
  "Визуализация",
  "Авторский аудиоподкаст",
  "Лекция",
  "Программа аудиопрактик",
  "Аудиокурс",
  "Цикл практик",
  "Сборник",
  "Аудиокнига",
] as const;

export type ProductPresetFormat = (typeof PRODUCT_PRESET_FORMATS)[number];

const PRESET_FORMAT_SET = new Set<string>(PRODUCT_PRESET_FORMATS);

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
