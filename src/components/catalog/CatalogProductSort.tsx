import Link from "next/link";

import {
  CATALOG_PRODUCT_SORT_OPTIONS,
  buildCatalogListingHref,
} from "@/lib/catalog/listing-filters";
import type { CatalogSort } from "@/lib/catalog/listing-contract";

type CatalogProductSortProps = {
  query: string;
  topic?: string | null;
  section?: string | null;
  access?: string | null;
  class?: string | null;
  sort: CatalogSort;
};

export default function CatalogProductSort({
  query,
  topic = null,
  section = null,
  access = null,
  class: publicationClass = null,
  sort,
}: CatalogProductSortProps) {
  const activeSort =
    CATALOG_PRODUCT_SORT_OPTIONS.find((option) => option.value === sort)?.value ??
    "new";

  return (
    <nav
      className="mt-3 xl:mt-2"
      aria-label="Сортировка каталога"
      data-catalog-product-sort
    >
      <div className="flex min-w-0 flex-wrap gap-2">
        {CATALOG_PRODUCT_SORT_OPTIONS.map((option) => {
          const isActive = option.value === activeSort;

          return (
            <Link
              key={option.value}
              href={buildCatalogListingHref({
                q: query,
                topic,
                section,
                access,
                class: publicationClass,
                sort: option.value,
              })}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 min-w-11 max-w-full break-words [overflow-wrap:anywhere] items-center rounded-full border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                isActive
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}