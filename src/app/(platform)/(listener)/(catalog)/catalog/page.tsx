import type { Metadata } from "next";
import Link from "next/link";

import AuthorListCard from "@/components/authors/AuthorListCard";
import CatalogChipFilterBar from "@/components/catalog/CatalogChipFilterBar";
import CatalogPromoCarousel from "@/components/catalog/CatalogPromoCarousel";
import TopicFilterBar from "@/components/catalog/TopicFilterBar";
import CatalogProductGrid from "@/components/products/CatalogProductGrid";
import {
  CATALOG_ACCESS_FILTER_OPTIONS,
  CATALOG_CLASS_FILTER_OPTIONS,
} from "@/lib/catalog/catalog-filter-ui";
import { listCatalogPromos } from "@/lib/catalog/catalog-promo";
import {
  mapCatalogAuthorSearchResultToPublicAuthorCard,
  searchPublishedCatalogAuthors,
} from "@/lib/catalog/author-search";
import {
  CATALOG_LISTING_PAGE_SIZE,
  listPublishedCatalog,
  parseCatalogListingQuery,
} from "@/lib/catalog/listing";
import {
  buildCatalogClearSearchHref,
  buildCatalogHref,
  getCatalogTopicFilterLabel,
  parseCatalogTopicFilters,
  resolveCatalogTopicSearchParam,
  serializeCatalogTopicParam,
} from "@/lib/catalog/topic-filter";
import { normalizeCatalogSearchQuery } from "@/lib/catalog/search";
import { buildCatalogMetadata } from "@/lib/seo/public-page-metadata";
import { listTopicsWithCatalogCounts } from "@/lib/topics/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams: Promise<{
    q?: string;
    topic?: string;
    need?: string;
    access?: string;
    class?: string;
    kind?: string;
    sort?: string;
  }>;
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
  const topicSearchParam = resolveCatalogTopicSearchParam(params);
  const listingQuery = parseCatalogListingQuery({
    q: searchQuery,
    topic: topicSearchParam,
    access: params.access,
    class: params.class,
    kind: params.kind,
    sort: params.sort,
    limit: CATALOG_LISTING_PAGE_SIZE,
  });
  const canLoadDefaultListingInParallel = !isSearchActive && !topicSearchParam;

  const [topicsWithCounts, defaultListing, authUser] = await Promise.all([
    listTopicsWithCatalogCounts(supabase),
    canLoadDefaultListingInParallel
      ? listPublishedCatalog(supabase, { ...listingQuery, topic: null })
      : Promise.resolve(null),
    supabase.auth.getUser().then(({ data }) => data.user),
  ]);
  const filterableTopics = topicsWithCounts.filter(
    (topic) => topic.catalogProductCount > 0,
  );
  const activeTopicKeys = parseCatalogTopicFilters(
    topicSearchParam,
    filterableTopics.map((topic) => topic.key),
  );
  const activeTopicParam = serializeCatalogTopicParam(activeTopicKeys);
  const activeTopicTitle = getCatalogTopicFilterLabel(
    activeTopicParam,
    filterableTopics,
  );
  const resolvedListingQuery = {
    ...listingQuery,
    topic: activeTopicParam,
  };
  const listingState = {
    access: resolvedListingQuery.access,
    class: resolvedListingQuery.class,
    sort: resolvedListingQuery.sort,
  };

  const [authors, listing] = await Promise.all([
    isSearchActive
      ? searchPublishedCatalogAuthors(supabase, {
          query: searchQuery,
          topicKey: activeTopicParam,
        })
      : Promise.resolve([]),
    defaultListing ?? listPublishedCatalog(supabase, resolvedListingQuery),
  ]);

  const hasAnyProducts = listing.items.length > 0;
  const isTopicFiltered = activeTopicKeys.length > 0;
  const showCatalogPromo = !isSearchActive && !isTopicFiltered;
  const isAccessFiltered = resolvedListingQuery.access !== "all";
  const isClassFiltered = resolvedListingQuery.class !== "all";
  const isListingFiltered = isTopicFiltered || isAccessFiltered || isClassFiltered;
  const clearSearchHref = buildCatalogClearSearchHref(activeTopicParam, listingState);
  const catalogRootHref = buildCatalogHref({
    q: searchQuery || null,
  });
  const signInReturnPath = buildCatalogHref({
    q: searchQuery || null,
    topic: activeTopicParam,
    access: resolvedListingQuery.access,
    class: resolvedListingQuery.class,
    sort: resolvedListingQuery.sort,
  });

  return (
    <>
      <h1 className="sr-only">Каталог</h1>

      {isSearchActive ? (
        <section className="mt-5" aria-labelledby="catalog-search-results-heading">
          <h2
            id="catalog-search-results-heading"
            className="text-[20px] font-semibold leading-7 text-[#25135c] sm:text-[22px]"
          >
            Результаты по запросу «{searchQuery}»
          </h2>
          {activeTopicTitle ? (
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              {activeTopicKeys.length > 1
                ? `В темах «${activeTopicTitle}».`
                : `В теме «${activeTopicTitle}».`}
            </p>
          ) : null}
        </section>
      ) : isTopicFiltered ? (
        <p className="mt-5 text-[15px] leading-6 text-[#7d70a2] xl:mt-3">
          {activeTopicKeys.length > 1
            ? `Аудиопродукты на темы «${activeTopicTitle}».`
            : `Аудиопродукты на тему «${activeTopicTitle}».`}
        </p>
      ) : showCatalogPromo ? (
        <CatalogPromoCarousel promos={listCatalogPromos()} />
      ) : null}

      <div className="hidden xl:block" data-catalog-desktop-filters>
        {filterableTopics.length > 0 ? (
          <TopicFilterBar
            topics={filterableTopics}
            activeTopicKey={activeTopicKeys[0] ?? null}
            activeTopicKeys={activeTopicKeys}
            searchQuery={searchQuery}
            listing={listingState}
          />
        ) : null}

        <CatalogChipFilterBar
          ariaLabel="Фильтр по доступу"
          options={CATALOG_ACCESS_FILTER_OPTIONS}
          activeValue={resolvedListingQuery.access}
          buildHref={(access) =>
            buildCatalogHref({
              q: searchQuery || null,
              topic: activeTopicParam,
              access,
              class: resolvedListingQuery.class,
              sort: resolvedListingQuery.sort,
            })
          }
        />

        <CatalogChipFilterBar
          ariaLabel="Фильтр по типу"
          options={CATALOG_CLASS_FILTER_OPTIONS}
          activeValue={resolvedListingQuery.class}
          buildHref={(publicationClass) =>
            buildCatalogHref({
              q: searchQuery || null,
              topic: activeTopicParam,
              access: resolvedListingQuery.access,
              class: publicationClass,
              sort: resolvedListingQuery.sort,
            })
          }
        />
      </div>

      {isSearchActive && authors.length > 0 ? (
        <section className="mt-6" aria-labelledby="catalog-search-authors-heading">
          <h3
            id="catalog-search-authors-heading"
            className="text-[18px] font-semibold leading-7 text-[#25135c]"
          >
            Авторы
          </h3>
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

      {hasAnyProducts ? (
        <CatalogProductGrid
          key={[
            resolvedListingQuery.q,
            resolvedListingQuery.topic,
            resolvedListingQuery.access,
            resolvedListingQuery.class,
            resolvedListingQuery.sort,
          ].join("|")}
          initialItems={listing.items}
          initialNextCursor={listing.nextCursor}
          query={resolvedListingQuery}
          isAuthenticated={Boolean(authUser)}
          signInReturnPath={signInReturnPath}
        />
      ) : isSearchActive && authors.length > 0 ? null : (
        <section className="mt-8">
          <div className="rounded-[24px] border border-[#e8def5] bg-[#faf6ff] px-5 py-8 text-center">
            {isSearchActive ? (
              <>
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
              </>
            ) : isListingFiltered ? (
              <>
                <p className="text-[15px] font-medium text-[#5f3f9d]">
                  {activeTopicTitle
                    ? `В выбранных фильтрах по ${activeTopicKeys.length > 1 ? "темам" : "теме"} «${activeTopicTitle}» пока нет аудиопродуктов.`
                    : "По выбранным фильтрам пока нет аудиопродуктов."}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                  Посмотрите{" "}
                  <Link
                    href={catalogRootHref}
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
                  Новые аудиопродукты скоро появятся.
                </p>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
