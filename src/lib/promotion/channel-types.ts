import {
  isSystemUtmMediumValue,
  resolveCustomUtmMedium,
} from "./utm-normalize";

export const PROMOTION_CHANNEL_TYPE_OTHER = "other" as const;

export type PromotionChannelTypeOption = {
  value: string;
  label: string;
};

export const PROMOTION_CHANNEL_TYPE_OPTIONS: PromotionChannelTypeOption[] = [
  { value: "social", label: "Социальная сеть" },
  { value: "messenger", label: "Мессенджер" },
  { value: "messaging_bot", label: "Бот рассылок" },
  { value: "email", label: "Email-рассылка" },
  { value: "paid", label: "Платная реклама" },
  { value: "partner", label: "Партнёрский канал" },
  { value: "website", label: "Сайт или блог" },
  { value: PROMOTION_CHANNEL_TYPE_OTHER, label: "Другое" },
];

const STANDARD_TYPE_VALUES = new Set(
  PROMOTION_CHANNEL_TYPE_OPTIONS.filter(
    (option) => option.value !== PROMOTION_CHANNEL_TYPE_OTHER,
  ).map((option) => option.value),
);

export function isStandardChannelType(value: string): boolean {
  return STANDARD_TYPE_VALUES.has(value.trim().toLowerCase());
}

export function getChannelTypeLabel(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const match = PROMOTION_CHANNEL_TYPE_OPTIONS.find(
    (option) => option.value === normalized,
  );
  return match?.label ?? null;
}

export type ParsedChannelTypeFormState = {
  channelType: string;
  customTypeLabel: string;
};

export function parseChannelTypeFormState(
  utmMedium: string,
): ParsedChannelTypeFormState {
  const trimmed = utmMedium.trim();

  if (!trimmed) {
    return {
      channelType: "social",
      customTypeLabel: "",
    };
  }

  const normalized = trimmed.toLowerCase();

  if (isStandardChannelType(normalized)) {
    return {
      channelType: normalized,
      customTypeLabel: "",
    };
  }

  if (isSystemUtmMediumValue(normalized) && !isStandardChannelType(normalized)) {
    return {
      channelType: PROMOTION_CHANNEL_TYPE_OTHER,
      customTypeLabel: trimmed,
    };
  }

  return {
    channelType: PROMOTION_CHANNEL_TYPE_OTHER,
    customTypeLabel: trimmed,
  };
}

export function resolveUtmMediumFromForm(
  channelType: string,
  customTypeLabel: string,
): string {
  if (channelType === PROMOTION_CHANNEL_TYPE_OTHER) {
    return resolveCustomUtmMedium(customTypeLabel);
  }

  return channelType.trim().toLowerCase();
}
