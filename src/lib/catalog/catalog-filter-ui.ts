export const CATALOG_ACCESS_FILTER_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "free", label: "Подарки" },
  { value: "paid", label: "Продукты" },
] as const;

export const CATALOG_KIND_FILTER_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "practice", label: "Практики" },
  { value: "music", label: "Музыка" },
  { value: "audio_post", label: "Посты" },
] as const;

export type CatalogFilterTopicOption = {
  key: string;
  title: string;
};
