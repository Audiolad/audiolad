export type PromotionChannelPresetId =
  | "telegram"
  | "max"
  | "vk"
  | "direct"
  | "custom";

export type PromotionChannelPreset = {
  id: PromotionChannelPresetId;
  label: string;
  utm_source: string;
  utm_medium: string;
  default_content: string;
};

export const PROMOTION_CHANNEL_PRESETS: PromotionChannelPreset[] = [
  {
    id: "telegram",
    label: "Telegram",
    utm_source: "telegram",
    utm_medium: "social",
    default_content: "main_post",
  },
  {
    id: "max",
    label: "MAX",
    utm_source: "max",
    utm_medium: "social",
    default_content: "main_post",
  },
  {
    id: "vk",
    label: "VK",
    utm_source: "vk",
    utm_medium: "social",
    default_content: "main_post",
  },
  {
    id: "direct",
    label: "Прямая ссылка",
    utm_source: "direct",
    utm_medium: "owned",
    default_content: "main_link",
  },
];

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
