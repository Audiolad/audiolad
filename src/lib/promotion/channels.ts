export type PromotionSystemChannelPresetId = "telegram" | "max" | "vk";

export type PromotionChannelPreset = {
  id: PromotionSystemChannelPresetId;
  label: string;
  utm_source: string;
  utm_medium: string;
};

/** Fixed system links rendered for every campaign (not stored in DB). */
export const PROMOTION_SYSTEM_CHANNEL_PRESETS: PromotionChannelPreset[] = [
  {
    id: "telegram",
    label: "Telegram",
    utm_source: "telegram",
    utm_medium: "social",
  },
  {
    id: "max",
    label: "MAX",
    utm_source: "max",
    utm_medium: "social",
  },
  {
    id: "vk",
    label: "VK",
    utm_source: "vk",
    utm_medium: "social",
  },
];

/** @deprecated Use PROMOTION_SYSTEM_CHANNEL_PRESETS. Kept for legacy imports/tests. */
export const PROMOTION_CHANNEL_PRESETS = PROMOTION_SYSTEM_CHANNEL_PRESETS;

const SOURCE_LABELS: Record<string, string> = {
  telegram: "Telegram",
  max: "MAX",
  vk: "VK",
  direct: "Прямая ссылка",
};

export function getUtmSourceLabel(source: string): string {
  const normalized = source.trim().toLowerCase();
  return SOURCE_LABELS[normalized] ?? (source.trim() || "Неизвестный канал");
}
