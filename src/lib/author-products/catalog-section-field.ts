import {
  resolveAudioPostFormatForStorage,
  resolveFormatForStorage,
} from "@/lib/author-products/format";
import { isMusicProductWizardEnabled } from "@/lib/author-products/music-product-wizard";
import { isAuthorProductWizardEnabled } from "@/lib/author-products/product-wizard-beta";
import { PRODUCT_KIND } from "@/lib/author-products/product-kind";
import {
  CATALOG_SECTIONS,
  isCatalogSection,
  type CatalogSection,
} from "@/lib/catalog/catalog-sections";

/**
 * Catalog section picker on the author product form.
 * Aurafon closed beta keeps the field on every product type.
 * Every other author sees it only for music / release.
 * Values are the existing practices.catalog_section check set.
 * Author-facing «Практики» is the meditations option; admin copy stays «Медитации».
 */

export const CATALOG_SECTION_FIELD_LABEL = "Категория в каталоге";

export const CATALOG_SECTION_FIELD_OPTIONS: ReadonlyArray<{
  value: CatalogSection;
  label: string;
}> = [
  { value: "meditations", label: "Практики" },
  { value: "music", label: "Музыка" },
  { value: "education", label: "Обучение" },
  { value: "stories", label: "Истории" },
  { value: "books", label: "Книги" },
];

export function isCatalogSectionFieldEnabled(input: {
  authorId?: string | null;
  productKind?: string | null;
  publicationClass?: string | null;
}): boolean {
  if (isAuthorProductWizardEnabled(input.authorId)) {
    return true;
  }

  return isMusicProductWizardEnabled({
    authorId: input.authorId,
    productKind: input.productKind,
    publicationClass: input.publicationClass,
  });
}

export function readStoredCatalogSection(
  value: unknown,
): CatalogSection | null {
  return isCatalogSection(value) ? value : null;
}

export function suggestCatalogSection(input: {
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

export function suggestCatalogSectionFromFormFields(input: {
  productKind?: string | null;
  publicationClass?: string | null;
  formatPreset: string;
  customFormat: string;
}): CatalogSection {
  return suggestCatalogSection({
    productKind: input.productKind,
    publicationClass: input.publicationClass,
    format: storedFormatForSuggestion(input),
  });
}

/**
 * Soft default until the author picks a section.
 * An explicit choice (overridden) is kept when type or format changes.
 */
export function applyCatalogSectionSuggestion(input: {
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

  return suggestCatalogSectionFromFormFields(input);
}

export function catalogSectionForProductForm(practice: {
  catalog_section?: string | null;
  product_kind?: string | null;
  publication_class?: string | null;
  format?: string | null;
}): CatalogSection {
  return (
    readStoredCatalogSection(practice.catalog_section) ??
    suggestCatalogSection({
      productKind: practice.product_kind,
      publicationClass: practice.publication_class,
      format: practice.format,
    })
  );
}

export function buildCatalogSectionSaveField(input: {
  authorId: string | null | undefined;
  productKind?: string | null;
  publicationClass?: string | null;
  catalogSection: unknown;
}): { catalog_section: CatalogSection } | Record<string, never> {
  if (
    !isCatalogSectionFieldEnabled({
      authorId: input.authorId,
      productKind: input.productKind,
      publicationClass: input.publicationClass,
    })
  ) {
    return {};
  }

  const catalogSection = readStoredCatalogSection(input.catalogSection);
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

export type CatalogSectionPatch =
  | { action: "omit" }
  | { action: "apply"; catalogSection: CatalogSection }
  | { action: "reject"; error: "invalid_catalog_section" };

/**
 * Canonical create/edit write.
 * Aurafon persists one of the five allowed values for any product type.
 * Any author persists catalog_section for music / release.
 * Other authors on practice, course, audiobook, and post never update the
 * column, including when the body contains the key.
 * Admin catalog-sections remains a separate correction path.
 */
export function resolveCatalogSectionPatch(input: {
  authorId: string | null | undefined;
  productKind?: string | null;
  publicationClass?: string | null;
  present: boolean;
  catalogSection: unknown;
}): CatalogSectionPatch {
  if (
    !input.present ||
    !isCatalogSectionFieldEnabled({
      authorId: input.authorId,
      productKind: input.productKind,
      publicationClass: input.publicationClass,
    })
  ) {
    return { action: "omit" };
  }

  if (!isCatalogSection(input.catalogSection)) {
    return { action: "reject", error: "invalid_catalog_section" };
  }

  return { action: "apply", catalogSection: input.catalogSection };
}

export function catalogSectionFieldValues(): readonly CatalogSection[] {
  return CATALOG_SECTIONS;
}
