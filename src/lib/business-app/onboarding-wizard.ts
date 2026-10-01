/**
 * P1-04 Owner onboarding wizard — Zero-to-Music thin vertical slice.
 *
 * Path: тип → атмосфера → preview → confirm → (create org/location) → Player/Music.
 * Atmosphere is UX preference only until P1-02 Sonic DNA; no DNA persistence here.
 * Preview is descriptive + UNKNOWN-safe — no Case A audio without CONFIRM, no rights claims.
 */

export const BUSINESS_ONBOARDING_STEPS = [
  "type",
  "atmosphere",
  "preview",
  "confirm",
  "done",
] as const;

export type BusinessOnboardingStep = (typeof BUSINESS_ONBOARDING_STEPS)[number];

export type BusinessOnboardingTypeOption = {
  id: string;
  label: string;
  /** Value persisted as business_locations.business_category */
  category: string;
  hint: string;
  defaultOrgName: string;
  defaultLocationName: string;
};

export type BusinessOnboardingAtmosphereOption = {
  id: string;
  label: string;
  /** Short vibe line for preview; not a rights or DNA claim. */
  vibe: string;
  energyHint: "calm" | "balanced" | "lively";
};

export const BUSINESS_ONBOARDING_TYPES: readonly BusinessOnboardingTypeOption[] =
  [
    {
      id: "beauty",
      label: "Салон красоты",
      category: "Салон красоты",
      hint: "Спокойный фон для гостей, без навязчивости.",
      defaultOrgName: "Салон",
      defaultLocationName: "Основной зал",
    },
    {
      id: "cafe",
      label: "Кафе / кофейня",
      category: "Кафе",
      hint: "Мягкий дневной эфир под разговоры и работу.",
      defaultOrgName: "Кафе",
      defaultLocationName: "Зал",
    },
    {
      id: "spa",
      label: "SPA / wellness",
      category: "SPA",
      hint: "Тихий, ровный фон для процедур.",
      defaultOrgName: "SPA",
      defaultLocationName: "Зона отдыха",
    },
    {
      id: "retail",
      label: "Магазин / ритейл",
      category: "Магазин",
      hint: "Нейтральный фон торгового зала.",
      defaultOrgName: "Магазин",
      defaultLocationName: "Торговый зал",
    },
    {
      id: "other",
      label: "Другой бизнес",
      category: "Другой бизнес",
      hint: "Укажем категорию и настроим точку.",
      defaultOrgName: "Организация",
      defaultLocationName: "Точка 1",
    },
  ] as const;

export const BUSINESS_ONBOARDING_ATMOSPHERES: readonly BusinessOnboardingAtmosphereOption[] =
  [
    {
      id: "calm_premium",
      label: "Спокойный · премиальный",
      vibe: "Тихо, ровно, без резких пиков — гости остаются в комфорте.",
      energyHint: "calm",
    },
    {
      id: "modern_soft",
      label: "Современный · мягкий",
      vibe: "Лёгкая современная фактура, без давления на разговор.",
      energyHint: "balanced",
    },
    {
      id: "warm_lively",
      label: "Тёплый · живой",
      vibe: "Чуть больше энергии, всё ещё фон — не концерт.",
      energyHint: "lively",
    },
  ] as const;

export const BUSINESS_ONBOARDING_RIGHTS_SAFE_DISCLAIMER =
  "Каталог эфира пока без подтверждённых ELIGIBLE-треков. Статус прав — UNKNOWN, пока нет evidence и freeze-list. Мы не утверждаем, что музыка «лицензирована».";

export const BUSINESS_ONBOARDING_PREVIEW_NO_AUDIO_NOTE =
  "Preview в этом шаге описательный: без воспроизведения треков Case A и без выдачи в эфир. Подключение плеера — после подтверждения точки.";

export function isBusinessOnboardingStep(
  value: string,
): value is BusinessOnboardingStep {
  return (BUSINESS_ONBOARDING_STEPS as readonly string[]).includes(value);
}

export function getBusinessOnboardingType(
  id: string | null | undefined,
): BusinessOnboardingTypeOption | null {
  if (!id) return null;
  return BUSINESS_ONBOARDING_TYPES.find((t) => t.id === id) ?? null;
}

export function getBusinessOnboardingAtmosphere(
  id: string | null | undefined,
): BusinessOnboardingAtmosphereOption | null {
  if (!id) return null;
  return BUSINESS_ONBOARDING_ATMOSPHERES.find((a) => a.id === id) ?? null;
}

export function nextBusinessOnboardingStep(
  step: BusinessOnboardingStep,
): BusinessOnboardingStep | null {
  const idx = BUSINESS_ONBOARDING_STEPS.indexOf(step);
  if (idx < 0 || idx >= BUSINESS_ONBOARDING_STEPS.length - 1) return null;
  return BUSINESS_ONBOARDING_STEPS[idx + 1]!;
}

export function prevBusinessOnboardingStep(
  step: BusinessOnboardingStep,
): BusinessOnboardingStep | null {
  const idx = BUSINESS_ONBOARDING_STEPS.indexOf(step);
  if (idx <= 0) return null;
  return BUSINESS_ONBOARDING_STEPS[idx - 1]!;
}

export function businessOnboardingStepIndex(
  step: BusinessOnboardingStep,
): number {
  return BUSINESS_ONBOARDING_STEPS.indexOf(step) + 1;
}

export function canAdvanceBusinessOnboardingStep(
  step: BusinessOnboardingStep,
  state: {
    typeId: string | null;
    atmosphereId: string | null;
  },
): boolean {
  if (step === "type") return Boolean(getBusinessOnboardingType(state.typeId));
  if (step === "atmosphere")
    return Boolean(getBusinessOnboardingAtmosphere(state.atmosphereId));
  if (step === "preview") return true;
  if (step === "confirm") return false; // submit handles advance
  if (step === "done") return false;
  return false;
}

export type BusinessOnboardingConfirmInput = {
  organizationName: string;
  locationName: string;
  businessCategory: string;
  countryCode?: string;
  timezone?: string;
};

export type BusinessOnboardingConfirmValidation =
  | { ok: true; value: Required<BusinessOnboardingConfirmInput> }
  | { ok: false; error: string };

export function validateBusinessOnboardingConfirm(
  input: BusinessOnboardingConfirmInput,
): BusinessOnboardingConfirmValidation {
  const organizationName = input.organizationName.trim();
  const locationName = input.locationName.trim();
  const businessCategory = input.businessCategory.trim();
  const countryCode = (input.countryCode ?? "RU").trim().toUpperCase() || "RU";
  const timezone =
    (input.timezone ?? "Europe/Moscow").trim() || "Europe/Moscow";

  if (organizationName.length < 1 || organizationName.length > 120) {
    return { ok: false, error: "invalid_organization_name" };
  }
  if (locationName.length < 1 || locationName.length > 120) {
    return { ok: false, error: "invalid_location_name" };
  }
  if (businessCategory.length < 1 || businessCategory.length > 120) {
    return { ok: false, error: "invalid_business_category" };
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return { ok: false, error: "invalid_country_code" };
  }

  return {
    ok: true,
    value: {
      organizationName,
      locationName,
      businessCategory,
      countryCode,
      timezone,
    },
  };
}

export function buildBusinessOnboardingPreviewSummary(input: {
  typeId: string | null;
  atmosphereId: string | null;
}): {
  typeLabel: string;
  atmosphereLabel: string;
  vibe: string;
  category: string;
  rightsSafeDisclaimer: string;
  noAudioNote: string;
} {
  const type = getBusinessOnboardingType(input.typeId);
  const atmosphere = getBusinessOnboardingAtmosphere(input.atmosphereId);
  return {
    typeLabel: type?.label ?? "Тип не выбран",
    atmosphereLabel: atmosphere?.label ?? "Атмосфера не выбрана",
    vibe: atmosphere?.vibe ?? "",
    category: type?.category ?? "",
    rightsSafeDisclaimer: BUSINESS_ONBOARDING_RIGHTS_SAFE_DISCLAIMER,
    noAudioNote: BUSINESS_ONBOARDING_PREVIEW_NO_AUDIO_NOTE,
  };
}

export function suggestBusinessOnboardingNames(typeId: string | null): {
  organizationName: string;
  locationName: string;
  businessCategory: string;
} {
  const type = getBusinessOnboardingType(typeId);
  return {
    organizationName: type?.defaultOrgName ?? "Организация",
    locationName: type?.defaultLocationName ?? "Точка 1",
    businessCategory: type?.category ?? "Другой бизнес",
  };
}
