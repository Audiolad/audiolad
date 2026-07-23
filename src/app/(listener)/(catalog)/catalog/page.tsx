import type { Metadata } from "next";
import Link from "next/link";

import CatalogSearchGroupedResults from "@/components/catalog/CatalogSearchGroupedResults";
import TopicFilterBar from "@/components/catalog/TopicFilterBar";
import CatalogProductCarousel from "@/components/products/CatalogProductCarousel";
import { searchPublishedCatalogAuthors } from "@/lib/catalog/author-search";
import {
  buildCatalogClearSearchHref,
  buildCatalogHref,
  getCatalogTopicFilterLabel,
  parseCatalogTopicFilter,
  resolveCatalogTopicSearchParam,
} from "@/lib/catalog/topic-filter";
import { normalizeCatalogSearchQuery, searchPublishedCatalogProducts } from "@/lib/catalog/search";
import { getPublishedCatalogSections } from "@/lib/products/catalog";
import { buildCatalogMetadata } from "@/lib/seo/public-page-metadata";
import { listTopicsWithCatalogCounts } from "@/lib/topics/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams: Promise<{ q?: string; topic?: string; need?: string }>;
};

export async function generateMetadata({
  searchParams,
}: CatalogPageProps): Promise<Metadata> {
  const params = await searchParams;
  const searchQuery = normalizeCatalogSearchQuery(params.q);

  if (searchQuery) {
    return buildCatalogMetadata({ robotsNoIndex: true });
  }

  return buildCatalogMetadata();
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
    ? await Promise.all([
        searchPublishedCatalogAuthors(supabase, {
          query: searchQuery,
          topicKey: activeTopicKey,
        }),
        searchPublishedCatalogProducts(supabase, {
          query: searchQuery,
          topicKey: activeTopicKey,
        }),
      ]).then(([authors, products]) => ({ authors, products }))
    : { authors: [], products: [] };

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
        <p className="mt-5 text-[15px] leading-6 text-[#7d70a2] xl:mt-3">
          {activeTopicTitle
            ? `Аудиопрактики и программы по теме «${activeTopicTitle}».`
            : "Опубликованные аудиопрактики и программы авторов платформы."}
        </p>
      ) : null}

      {filterableTopics.length > 0 ? (
        <TopicFilterBar
          topics={filterableTopics}
          activeTopicKey={activeTopicKey}
          searchQuery={searchQuery}
        />
      ) : null}

      {isSearchActive ? (
        <CatalogSearchGroupedResults
          searchQuery={searchQuery}
          activeTopicTitle={activeTopicTitle}
          authors={searchResults.authors}
          products={searchResults.products}
          clearSearchHref={clearSearchHref}
        />
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
