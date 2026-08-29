export const PRODUCT_SEO_STYLE_PRESETS = [
  "balanced",
  "warm_friendly",
  "calm_expert",
  "conversational",
  "concise",
  "inspiring",
  "custom",
] as const;

export type ProductSeoStylePreset = (typeof PRODUCT_SEO_STYLE_PRESETS)[number];

export const PRODUCT_SEO_STYLE_VARIETIES = ["calm", "balanced", "high"] as const;

export type ProductSeoStyleVariety = (typeof PRODUCT_SEO_STYLE_VARIETIES)[number];

export type ProductSeoStyleSliders = {
  warmth: number;
  expertise: number;
  conversational: number;
  expressiveness: number;
};

export type ProductSeoStyleProfile = ProductSeoStyleSliders & {
  preset: ProductSeoStylePreset;
  variety: ProductSeoStyleVariety;
};

export const PRODUCT_SEO_DEFAULT_STYLE_PRESET: Exclude<
  ProductSeoStylePreset,
  "custom"
> = "balanced";

export const PRODUCT_SEO_DEFAULT_STYLE_VARIETY: ProductSeoStyleVariety =
  "balanced";

/**
 * Single source of truth for named style presets.
 * Slider values are 0–100. Do not copy these numbers into JSX.
 */
export const PRODUCT_SEO_STYLE_PRESET_VALUES: Record<
  Exclude<ProductSeoStylePreset, "custom">,
  ProductSeoStyleSliders
> = {
  balanced: {
    warmth: 50,
    expertise: 50,
    conversational: 50,
    expressiveness: 40,
  },
  warm_friendly: {
    warmth: 85,
    expertise: 40,
    conversational: 70,
    expressiveness: 60,
  },
  calm_expert: {
    warmth: 45,
    expertise: 85,
    conversational: 35,
    expressiveness: 25,
  },
  conversational: {
    warmth: 65,
    expertise: 40,
    conversational: 90,
    expressiveness: 55,
  },
  concise: {
    warmth: 35,
    expertise: 60,
    conversational: 25,
    expressiveness: 15,
  },
  inspiring: {
    warmth: 80,
    expertise: 40,
    conversational: 65,
    expressiveness: 85,
  },
};

export const PRODUCT_SEO_STYLE_PRESET_LABELS: Record<
  ProductSeoStylePreset,
  string
> = {
  balanced: "Сбалансированный",
  warm_friendly: "Тёплый и дружелюбный",
  calm_expert: "Спокойный экспертный",
  conversational: "Живой разговорный",
  concise: "Лаконичный",
  inspiring: "Вдохновляющий",
  custom: "Свой стиль",
};

export const PRODUCT_SEO_STYLE_VARIETY_LABELS: Record<
  ProductSeoStyleVariety,
  string
> = {
  calm: "Спокойное",
  balanced: "Сбалансированное",
  high: "Высокое",
};

export const PRODUCT_SEO_STYLE_PROFILE_KEYS = [
  "preset",
  "warmth",
  "expertise",
  "conversational",
  "expressiveness",
  "variety",
] as const;

export const PRODUCT_SEO_FORBIDDEN_STYLE_KEYS = [
  "systemPrompt",
  "system",
  "model",
  "temperature",
  "provider",
  "instructions",
  "messages",
  "role",
  "prompt",
  "styleInstruction",
  "tools",
  "web_search",
] as const;

/**
 * No existing author-scoped settings JSON is safe to reuse for a default
 * style. Persistence needs a dedicated follow-up (new field/table + RLS).
 * This module is ready to serialize a preference later.
 */
export const PRODUCT_SEO_AUTHOR_STYLE_PERSISTENCE = "follow_up" as const;

export function clampStyleSlider(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function createDefaultProductSeoStyleProfile(): ProductSeoStyleProfile {
  return {
    preset: PRODUCT_SEO_DEFAULT_STYLE_PRESET,
    variety: PRODUCT_SEO_DEFAULT_STYLE_VARIETY,
    ...PRODUCT_SEO_STYLE_PRESET_VALUES[PRODUCT_SEO_DEFAULT_STYLE_PRESET],
  };
}

export function applyProductSeoStylePreset(
  preset: Exclude<ProductSeoStylePreset, "custom">,
  variety: ProductSeoStyleVariety = PRODUCT_SEO_DEFAULT_STYLE_VARIETY,
): ProductSeoStyleProfile {
  return {
    preset,
    variety,
    ...PRODUCT_SEO_STYLE_PRESET_VALUES[preset],
  };
}

export function slidersMatchPreset(
  preset: Exclude<ProductSeoStylePreset, "custom">,
  sliders: ProductSeoStyleSliders,
): boolean {
  const expected = PRODUCT_SEO_STYLE_PRESET_VALUES[preset];
  return (
    sliders.warmth === expected.warmth &&
    sliders.expertise === expected.expertise &&
    sliders.conversational === expected.conversational &&
    sliders.expressiveness === expected.expressiveness
  );
}

export function withCustomStyleSliders(
  current: ProductSeoStyleProfile,
  sliders: Partial<ProductSeoStyleSliders>,
): ProductSeoStyleProfile {
  return {
    ...current,
    warmth: clampStyleSlider(sliders.warmth ?? current.warmth),
    expertise: clampStyleSlider(sliders.expertise ?? current.expertise),
    conversational: clampStyleSlider(
      sliders.conversational ?? current.conversational,
    ),
    expressiveness: clampStyleSlider(
      sliders.expressiveness ?? current.expressiveness,
    ),
    preset: "custom",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requestHasForbiddenStyleKeys(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return PRODUCT_SEO_FORBIDDEN_STYLE_KEYS.some((key) => key in value);
}

export type SanitizeStyleProfileResult =
  | { ok: true; profile: ProductSeoStyleProfile }
  | { ok: false; reason: "invalid_preset" | "invalid_variety" | "forbidden_key" | "malformed" };

export function sanitizeProductSeoStyleProfile(
  value: unknown,
): SanitizeStyleProfileResult {
  if (value == null) {
    return { ok: true, profile: createDefaultProductSeoStyleProfile() };
  }

  if (!isRecord(value)) {
    return { ok: false, reason: "malformed" };
  }

  if (requestHasForbiddenStyleKeys(value)) {
    return { ok: false, reason: "forbidden_key" };
  }

  const extraKeys = Object.keys(value).filter(
    (key) =>
      !PRODUCT_SEO_STYLE_PROFILE_KEYS.includes(
        key as (typeof PRODUCT_SEO_STYLE_PROFILE_KEYS)[number],
      ),
  );
  if (extraKeys.length > 0) {
    return { ok: false, reason: "forbidden_key" };
  }

  const presetRaw = value.preset;
  if (
    typeof presetRaw !== "string" ||
    !PRODUCT_SEO_STYLE_PRESETS.includes(presetRaw as ProductSeoStylePreset)
  ) {
    return { ok: false, reason: "invalid_preset" };
  }
  const preset = presetRaw as ProductSeoStylePreset;

  const varietyRaw = value.variety;
  if (
    typeof varietyRaw !== "string" ||
    !PRODUCT_SEO_STYLE_VARIETIES.includes(varietyRaw as ProductSeoStyleVariety)
  ) {
    return { ok: false, reason: "invalid_variety" };
  }
  const variety = varietyRaw as ProductSeoStyleVariety;

  if (preset !== "custom") {
    return {
      ok: true,
      profile: applyProductSeoStylePreset(preset, variety),
    };
  }

  const sliders = {
    warmth: clampStyleSlider(Number(value.warmth)),
    expertise: clampStyleSlider(Number(value.expertise)),
    conversational: clampStyleSlider(Number(value.conversational)),
    expressiveness: clampStyleSlider(Number(value.expressiveness)),
  };

  return {
    ok: true,
    profile: {
      preset: "custom",
      variety,
      ...sliders,
    },
  };
}

export function productSeoStylePromptLines(
  profile: ProductSeoStyleProfile,
): string[] {
  return [
    `Стиль текста (только разрешённый профиль): preset=${profile.preset}; warmth=${profile.warmth}; expertise=${profile.expertise}; conversational=${profile.conversational}; expressiveness=${profile.expressiveness}; variety=${profile.variety}.`,
    "Приоритет всегда такой: 1) фактическая опора на контекст, 2) SEO-семантика, 3) польза и читаемость, 4) стиль.",
    "warmth — мягкость, человеческая интонация, обращение к ситуации слушателя.",
    "expertise — точность, структура, объясняющая глубина.",
    "conversational — естественная речь и более простой синтаксис.",
    "expressiveness — образность и эмоциональный цвет.",
    "variety — разнообразие структуры и формулировок, не выдуманные факты и не вычурная литература.",
    "seoTitle: влияние стиля минимальное. Сначала основной запрос, ясность поиска, соответствие продукту, 50–70 символов, без набивки. Не превращай заголовок в литературный из-за высокой выразительности.",
    "seoDescription, seoAbout, usageItems, вопросы и ответы FAQ: стиль влияет на тон и естественность формулировок.",
    "FAQ остаётся SEO-first: ровно 3 вопроса, Q1 содержит основной запрос, якоря не зависят от стиля.",
  ];
}
