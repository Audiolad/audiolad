import Link from "next/link";

import AuthorListCard from "@/components/authors/AuthorListCard";
import CatalogProductCard from "@/components/products/CatalogProductCard";
import {
  mapCatalogAuthorSearchResultToPublicAuthorCard,
  type CatalogAuthorSearchResult,
} from "@/lib/catalog/author-search";
import {
  formatCatalogSearchResultsSummary,
  isCatalogGroupedSearchEmpty,
} from "@/lib/catalog/search-suggestions";
import type { CatalogProduct } from "@/lib/products/catalog";

type CatalogSearchGroupedResultsProps = {
  searchQuery: string;
  activeTopicTitle: string | null;
  authors: CatalogAuthorSearchResult[];
  products: CatalogProduct[];
  clearSearchHref: string;
};

function formatSectionCount(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} ${one}`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ${few}`;
  }

  return `${count} ${many}`;
}

export default function CatalogSearchGroupedResults({
  searchQuery,
  activeTopicTitle,
  authors,
  products,
  clearSearchHref,
}: CatalogSearchGroupedResultsProps) {
  const summary = formatCatalogSearchResultsSummary(authors.length, products.length);
  const isEmpty = isCatalogGroupedSearchEmpty(authors.length, products.length);

  return (
    <section className="mt-8" aria-labelledby="catalog-search-results-heading">
      <h2
        id="catalog-search-results-heading"
        className="text-[20px] font-semibold leading-7 text-[#25135c] sm:text-[22px]"
      >
        Результаты по запросу «{searchQuery}»
      </h2>

      {activeTopicTitle ? (
        <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
          В теме «{activeTopicTitle}».
        </p>
      ) : null}

      {summary ? (
        <p className="mt-3 text-sm font-medium text-[#7d70a2]">{summary}</p>
      ) : null}

      {isEmpty ? (
        <div className="mt-5 rounded-[24px] border border-[#e8def5] bg-[#faf6ff] px-5 py-8 text-center">
          <p className="text-[15px] font-medium text-[#5f3f9d]">
            По запросу «{searchQuery}» ничего не найдено
          </p>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Попробуйте изменить запрос или выбрать другую тему.
          </p>
          <Link
            href={clearSearchHref}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#ddcfef] bg-white px-5 py-2 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Очистить поиск
          </Link>
        </div>
      ) : (
        <div className="mt-5 space-y-8">
          {authors.length > 0 ? (
            <section aria-labelledby="catalog-search-authors-heading">
              <div className="flex items-end justify-between gap-3">
                <h3
                  id="catalog-search-authors-heading"
                  className="text-[18px] font-semibold leading-7 text-[#25135c]"
                >
                  Авторы
                </h3>
                <p className="text-sm text-[#7d70a2]">
                  {formatSectionCount(
                    authors.length,
                    "автор",
                    "автора",
                    "авторов",
                  )}
                </p>
              </div>

              <ul className="mt-4 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {authors.map((author) => (
                  <li key={author.id}>
                    <AuthorListCard
                      author={mapCatalogAuthorSearchResultToPublicAuthorCard(author)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {products.length > 0 ? (
            <section aria-labelledby="catalog-search-products-heading">
              <div className="flex items-end justify-between gap-3">
                <h3
                  id="catalog-search-products-heading"
                  className="text-[18px] font-semibold leading-7 text-[#25135c]"
                >
                  Аудиопродукты
                </h3>
                <p className="text-sm text-[#7d70a2]">
                  {formatSectionCount(
                    products.length,
                    "аудиопродукт",
                    "аудиопродукта",
                    "аудиопродуктов",
                  )}
                </p>
              </div>

              <ul className="mt-4 flex list-none flex-col gap-4 p-0">
                {products.map((product) => (
                  <li key={product.id}>
                    <CatalogProductCard product={product} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
