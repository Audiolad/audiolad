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

export const SEO_QUERY_INTENT_LABELS: Record<SeoQueryIntent, string> = {
  listen_audio: "Слушать аудио",
  music: "Музыка",
  practice: "Практика",
  how_to: "Инструкция",
  informational: "Справочный",
  experience_story: "Личный опыт",
  specific_content: "Конкретный контент",
  transactional: "Коммерческий",
  navigation: "Навигационный",
  realtime: "Актуальные данные",
  other: "Другое",
};

export const SEO_QUERY_CONFIDENCE_LABELS: Record<"high" | "medium" | "low", string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

export const SEO_QUERY_SOURCE_LABELS: Record<string, string> = {
  manual: "Вручную",
  wordstat: "Wordstat",
  search_console: "Search Console",
  yandex_webmaster: "Яндекс Вебмастер",
  other: "Другое",
};

/** Russian label for a stored taxonomy value; unknown values are shown as-is. */
export function seoQueryLabel(labels: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "–";
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : value;
}

export type SeoQueryIntent = (typeof SEO_QUERY_INTENTS)[number];
export type SeoQueryAudioFit = (typeof SEO_QUERY_AUDIO_FITS)[number];
export type SeoQueryFormat = (typeof SEO_QUERY_FORMATS)[number];
export type SeoQueryDisposition = "analyzed" | "not_applicable";
