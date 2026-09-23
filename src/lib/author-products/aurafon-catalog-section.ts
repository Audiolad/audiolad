import {
  resolveAudioPostFormatForStorage,
  resolveFormatForStorage,
} from "@/lib/author-products/format";
import { isAuthorProductWizardEnabled } from "@/lib/author-products/product-wizard-beta";
import { PRODUCT_KIND } from "@/lib/author-products/product-kind";
import {
  CATALOG_SECTIONS,
  isCatalogSection,
  type CatalogSection,
} from "@/lib/catalog/catalog-sections";

/**
 * Closed-beta catalog section picker for the Aurafon author cabinet.
 * Gate is the existing product-wizard beta (Aurafon UUID only).
 * Values are the existing practices.catalog_section check set.
 * Author-facing «Практики» is the meditations option; admin copy stays «Медитации».
 */

export const AURAFON_CATALOG_SECTION_FIELD_LABEL = "Категория в каталоге";

export const AURAFON_CATALOG_SECTION_OPTIONS: ReadonlyArray<{
  value: CatalogSection;
  label: string;
}> = [
  { value: "meditations", label: "Практики" },
  { value: "music", label: "Музыка" },
  { value: "education", label: "Обучение" },
  { value: "stories", label: "Истории" },
  { value: "books", label: "Книги" },
];

export function isAurafonCatalogSectionFieldEnabled(
  authorId: string | null | undefined,
): boolean {
  return isAuthorProductWizardEnabled(authorId);
}

export function readStoredAurafonCatalogSection(
  value: unknown,
): CatalogSection | null {
  return isCatalogSection(value) ? value : null;
}

export function suggestAurafonCatalogSection(input: {
  productKind?: string | null;
  publicationClass?: string | null;
  format?: string | null;
}): CatalogSection {
  const productKind = input.productKind?.trim() ?? "";
  const publicationClass = input.publicationClass?.trim() ?? "";
  const format = input.format?.trim() ?? "";

  if (productKind === PRODUCT_KIND.MUSIC || publicationClass === "release") {
    return "music";
  }

  if (publicationClass === "course") {
    return "education";
  }

  if (publicationClass === "audiobook") {
    return "books";
  }

  if (format === "Аудиоистория") {
    return "stories";
  }

  if (format === "Аудиокнига") {
    return "books";
  }

  if (format === "Лекция" || format === "Аудиокурс") {
    return "education";
  }

  return "meditations";
}

function storedFormatForSuggestion(input: {
  productKind?: string | null;
  formatPreset: string;
  customFormat: string;
}): string | null {
  if (input.productKind === PRODUCT_KIND.MUSIC) {
    return null;
  }

  if (input.productKind === PRODUCT_KIND.AUDIO_POST) {
    const stored = resolveAudioPostFormatForStorage(
      input.formatPreset,
      input.customFormat,
    );
    return stored.ok ? stored.format : null;
  }

  return resolveFormatForStorage(input.formatPreset, input.customFormat);
}

export function suggestAurafonCatalogSectionFromFormFields(input: {
  productKind?: string | null;
  publicationClass?: string | null;
  formatPreset: string;
  customFormat: string;
}): CatalogSection {
  return suggestAurafonCatalogSection({
    productKind: input.productKind,
    publicationClass: input.publicationClass,
    format: storedFormatForSuggestion(input),
  });
}

/**
 * Soft default until the author picks a section.
 * An explicit choice (overridden) is kept when type or format changes.
 */
export function applyAurafonCatalogSectionSuggestion(input: {
  overridden: boolean;
  current: CatalogSection;
  productKind?: string | null;
  publicationClass?: string | null;
  formatPreset: string;
  customFormat: string;
}): CatalogSection {
  if (input.overridden) {
    return input.current;
  }

  return suggestAurafonCatalogSectionFromFormFields(input);
}

export function catalogSectionForProductForm(practice: {
  catalog_section?: string | null;
  product_kind?: string | null;
  publication_class?: string | null;
  format?: string | null;
}): CatalogSection {
  return (
    readStoredAurafonCatalogSection(practice.catalog_section) ??
    suggestAurafonCatalogSection({
      productKind: practice.product_kind,
      publicationClass: practice.publication_class,
      format: practice.format,
    })
  );
}

export function buildAurafonCatalogSectionSaveField(input: {
  authorId: string | null | undefined;
  catalogSection: unknown;
}): { catalog_section: CatalogSection } | Record<string, never> {
  if (!isAurafonCatalogSectionFieldEnabled(input.authorId)) {
    return {};
  }

  const catalogSection = readStoredAurafonCatalogSection(input.catalogSection);
  if (!catalogSection) {
    return {};
  }

  return { catalog_section: catalogSection };
}

export function catalogSectionColumnForInsert(
  catalogSection: CatalogSection | null | undefined,
): { catalog_section: CatalogSection } | Record<string, never> {
  if (!catalogSection) {
    return {};
  }

  return { catalog_section: catalogSection };
}

export type AurafonCatalogSectionPatch =
  | { action: "omit" }
  | { action: "apply"; catalogSection: CatalogSection }
  | { action: "reject"; error: "invalid_catalog_section" };

/**
 * Canonical create/edit write. Other authors never update catalog_section,
 * including when the body contains the key. Aurafon persists one of the five
 * allowed values. Admin catalog-sections remains a separate correction path.
 */
export function resolveAurafonCatalogSectionPatch(input: {
  authorId: string | null | undefined;
  present: boolean;
  catalogSection: unknown;
}): AurafonCatalogSectionPatch {
  if (!input.present || !isAurafonCatalogSectionFieldEnabled(input.authorId)) {
    return { action: "omit" };
  }

  if (!isCatalogSection(input.catalogSection)) {
    return { action: "reject", error: "invalid_catalog_section" };
  }

  return { action: "apply", catalogSection: input.catalogSection };
}

export function aurafonCatalogSectionValues(): readonly CatalogSection[] {
  return CATALOG_SECTIONS;
}
