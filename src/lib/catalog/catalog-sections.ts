export const CATALOG_SECTIONS = [
  "music",
  "meditations",
  "education",
  "stories",
  "books",
] as const;

export type CatalogSection = (typeof CATALOG_SECTIONS)[number];

export const CATALOG_SECTION_LABELS: Record<CatalogSection, string> = {
  music: "Музыка",
  meditations: "Медитации",
  education: "Обучение",
  stories: "Истории",
  books: "Книги",
};

export type CatalogSectionFilter = "all" | "unassigned" | CatalogSection;

export const CATALOG_SECTION_FILTER_OPTIONS: ReadonlyArray<{
  value: CatalogSectionFilter;
  label: string;
}> = [
  { value: "all", label: "Все" },
  { value: "unassigned", label: "Без раздела" },
  { value: "music", label: "Музыка" },
  { value: "meditations", label: "Медитации" },
  { value: "education", label: "Обучение" },
  { value: "stories", label: "Истории" },
  { value: "books", label: "Книги" },
];

export function isCatalogSection(value: unknown): value is CatalogSection {
  return (
    typeof value === "string" &&
    (CATALOG_SECTIONS as readonly string[]).includes(value)
  );
}

export function resolveCatalogSectionFilter(
  value: string | undefined,
): CatalogSectionFilter {
  if (value === "unassigned" || isCatalogSection(value)) {
    return value;
  }

  return "all";
}

export const PUBLIC_CATALOG_SECTION_CARDS = [
  { value: "music", label: "Музыка", asset: "music" },
  { value: "meditations", label: "Практики", asset: "practices" },
  { value: "education", label: "Обучение", asset: "education" },
  { value: "stories", label: "Истории", asset: "stories" },
] as const;

export type PublicCatalogSection =
  (typeof PUBLIC_CATALOG_SECTION_CARDS)[number]["value"];

export function isPublicCatalogSection(
  value: string | null | undefined,
): value is PublicCatalogSection {
  return PUBLIC_CATALOG_SECTION_CARDS.some(
    (section) => section.value === value,
  );
}

export function parsePublicCatalogSection(
  value: string | null | undefined,
): PublicCatalogSection | null {
  const normalized = value?.trim().toLowerCase();
  return isPublicCatalogSection(normalized) ? normalized : null;
}
