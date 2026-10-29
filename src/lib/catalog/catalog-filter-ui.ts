export const CATALOG_ACCESS_FILTER_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "free", label: "Подарки" },
  { value: "paid", label: "Продукты" },
] as const;

export const CATALOG_CLASS_FILTER_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "practice", label: "Практики" },
  { value: "stories", label: "Истории" },
  { value: "course", label: "Курсы" },
  { value: "education", label: "Обучение" },
  { value: "audiobook", label: "Аудиокниги" },
  { value: "release", label: "Музыка" },
  { value: "post", label: "Посты" },
] as const;

/** @deprecated Use CATALOG_CLASS_FILTER_OPTIONS. */
export const CATALOG_KIND_FILTER_OPTIONS = CATALOG_CLASS_FILTER_OPTIONS;

export type CatalogFilterTopicOption = {
  key: string;
  title: string;
};
