import type { Metadata } from "next";
import Link from "next/link";

import CatalogSearchForm from "@/components/catalog/CatalogSearchForm";
import TopicFilterBar from "@/components/catalog/TopicFilterBar";
import CatalogProductCard from "@/components/products/CatalogProductCard";
import CatalogProductCarousel from "@/components/products/CatalogProductCarousel";
import {
  buildCatalogClearSearchHref,
  buildCatalogHref,
  getCatalogTopicFilterLabel,
  parseCatalogTopicFilter,
  resolveCatalogTopicSearchParam,
} from "@/lib/catalog/topic-filter";
import { normalizeCatalogSearchQuery, searchPublishedCatalogProducts } from "@/lib/catalog/search";
import { getPublishedCatalogSections } from "@/lib/products/catalog";
import { listTopicsWithCatalogCounts } from "@/lib/topics/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams: Promise<{ q?: string; topic?: string; need?: string }>;
};

function formatResultsCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} результат`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} результата`;
  }

  return `${count} результатов`;
}

export async function generateMetadata({
  searchParams,
}: CatalogPageProps): Promise<Metadata> {
  const params = await searchParams;
  const searchQuery = normalizeCatalogSearchQuery(params.q);

  if (searchQuery) {
    return {
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  return {};
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const searchQuery = normalizeCatalogSearchQuery(params.q);
  const isSearchActive = searchQuery.length > 0;

  const topicsWithCounts = await listTopicsWithCatalogCounts(supabase);
  const filterableTopics = topicsWithCounts.filter(
    (topic) => topic.catalogProductCount > 0,
  );
  const activeTopicKey = parseCatalogTopicFilter(
    resolveCatalogTopicSearchParam(params),
    filterableTopics.map((topic) => topic.key),
  );
  const activeTopicTitle = getCatalogTopicFilterLabel(
    activeTopicKey,
    filterableTopics,
  );

  const searchResults = isSearchActive
    ? await searchPublishedCatalogProducts(supabase, {
        query: searchQuery,
        topicKey: activeTopicKey,
      })
    : [];

  const { freeProducts, paidProducts } = isSearchActive
    ? { freeProducts: [], paidProducts: [] }
    : await getPublishedCatalogSections(supabase, { topicKey: activeTopicKey });

  const hasAnyProducts = freeProducts.length > 0 || paidProducts.length > 0;
  const isTopicFiltered = activeTopicKey !== null;
  const clearSearchHref = buildCatalogClearSearchHref(activeTopicKey);

  return (
    <>
      <h1 className="hidden text-[28px] font-semibold xl:block">Каталог</h1>

      {!isSearchActive ? (
        <p className="mt-4 text-[15px] leading-6 text-[#7d70a2] xl:mt-3">
          {activeTopicTitle
            ? `Аудиопрактики и программы по теме «${activeTopicTitle}».`
            : "Опубликованные аудиопрактики и программы авторов платформы."}
        </p>
      ) : null}

      <CatalogSearchForm query={searchQuery} activeTopicKey={activeTopicKey} />

      {filterableTopics.length > 0 ? (
        <TopicFilterBar
          topics={filterableTopics}
          activeTopicKey={activeTopicKey}
          searchQuery={searchQuery}
        />
      ) : null}

      {isSearchActive ? (
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

          {searchResults.length > 0 ? (
            <>
              <p className="mt-3 text-sm font-medium text-[#7d70a2]">
                {formatResultsCount(searchResults.length)}
              </p>

              <ul className="mt-5 flex list-none flex-col gap-4 p-0">
                {searchResults.map((product) => (
                  <li key={product.id}>
                    <CatalogProductCard product={product} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
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
          )}
        </section>
      ) : (
        <>
          {freeProducts.length > 0 ? (
            <CatalogProductCarousel
              title="Слушать в подарок"
              products={freeProducts}
              ariaLabel="Слушать в подарок"
              prevAriaLabel="Предыдущие практики в подарок"
              nextAriaLabel="Следующие практики в подарок"
            />
          ) : null}

          {paidProducts.length > 0 ? (
            <CatalogProductCarousel
              title="Аудиопрактики и программы"
              products={paidProducts}
              ariaLabel="Аудиопрактики и программы"
              prevAriaLabel="Предыдущие аудиопрактики и программы"
              nextAriaLabel="Следующие аудиопрактики и программы"
            />
          ) : null}

          {!hasAnyProducts ? (
            <section className="mt-8">
              <div className="rounded-[24px] border border-[#e8def5] bg-[#faf6ff] px-5 py-8 text-center">
                {isTopicFiltered && activeTopicTitle ? (
                  <>
                    <p className="text-[15px] font-medium text-[#5f3f9d]">
                      В теме «{activeTopicTitle}» пока нет опубликованных
                      аудиопродуктов.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                      Посмотрите{" "}
                      <Link
                        href={buildCatalogHref({ topic: null })}
                        className="font-medium text-[#7042c5] underline-offset-2 hover:underline"
                      >
                        весь каталог
                      </Link>
                      .
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[15px] font-medium text-[#5f3f9d]">
                      В каталоге пока нет опубликованных аудиопродуктов.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                      Новые практики и программы скоро появятся.
                    </p>
                  </>
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
