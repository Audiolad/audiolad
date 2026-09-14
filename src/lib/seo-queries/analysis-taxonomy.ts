export const SEO_QUERY_INTENTS = [
  "listen_audio", "music", "practice", "how_to", "informational",
  "experience_story", "specific_content", "transactional", "navigation", "realtime", "other",
] as const;
export const SEO_QUERY_AUDIO_FITS = ["high", "medium", "low", "none"] as const;
export const SEO_QUERY_FORMATS = [
  "Медитация", "Энергопрактика", "Лекция", "Аудиокурс", "Подкаст", "Музыка",
  "Аудиокнига", "Сеанс", "Сон", "Молитва", "Свой формат",
] as const;

export const SEO_QUERY_AUDIO_FIT_LABELS: Record<SeoQueryAudioFit, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
  none: "Не подходит",
};

export type SeoQueryIntent = (typeof SEO_QUERY_INTENTS)[number];
export type SeoQueryAudioFit = (typeof SEO_QUERY_AUDIO_FITS)[number];
export type SeoQueryFormat = (typeof SEO_QUERY_FORMATS)[number];
export type SeoQueryDisposition = "analyzed" | "not_applicable";
