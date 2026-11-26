import {
  CATALOG_PUBLIC_SORT_OPTIONS,
  parseCatalogListingQuery,
} from "@/lib/catalog/listing-contract";

export type CatalogPublicSort = (typeof CATALOG_PUBLIC_SORT_OPTIONS)[number];

export { CATALOG_PUBLIC_SORT_OPTIONS };

export const CATALOG_PRODUCT_SORT_OPTIONS = [
  { value: "new", label: "Новые" },
  { value: "popular", label: "Популярные" },
  { value: "rating", label: "По рейтингу" },
] as const satisfies ReadonlyArray<{
  value: CatalogPublicSort;
  label: string;
}>;

export type CatalogProductSortOption = (typeof CATALOG_PRODUCT_SORT_OPTIONS)[number];

export type CatalogListingStateInput = {
  q?: string | null;
  topic?: string | null;
  section?: string | null;
  access?: string | null;
  class?: string | null;
  sort?: string | null;
};

export function buildCatalogListingHref(
  input: CatalogListingStateInput = {},
): string {
  const query = parseCatalogListingQuery({
    q: input.q,
    topic: input.topic,
    section: input.section,
    access: input.access,
    class: input.class,
    sort: input.sort,
  });
  const params = new URLSearchParams();

  if (query.q) {
    params.set("q", query.q);
  }

  if (query.topic) {
    params.set("topic", query.topic);
  }

  if (query.section) {
    params.set("section", query.section);
  }

  if (query.access !== "all") {
    params.set("access", query.access);
  }

  if (query.class !== "all") {
    params.set("class", query.class);
  }

  if (query.sort !== "new") {
    params.set("sort", query.sort);
  }

  const search = params.toString();
  return search ? `/catalog?${search}` : "/catalog";
}