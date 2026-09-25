#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AUTHOR_SEO_DISCOVERY_SURFACES,
  buildAuthorDiscoveryDatabaseMatches,
  isHiddenFromProductCreateDiscovery,
  resolveAuthorDiscoveryReservationState,
  takeRankedDiscoveryItemsUntilVisible,
} from "../src/lib/seo-queries/author-discovery-status.ts";
import {
  AURAFON_AUTHOR_ID,
  SEO_DISCOVERY_BETA_DISABLED_MESSAGE,
  SEO_NON_AURAFON_RESERVATION_PUBLICATION_CLASS,
  isMusicCreateSeoDiscoveryEnabled,
} from "../src/lib/seo-queries/discovery-beta.ts";
import { SEO_DISCOVERY_DATABASE_LIMIT } from "../src/lib/seo-queries/discovery-ranking.ts";
import { resolveBackfillMode } from "./seo-legacy-primary-query-backfill.mjs";
import {
  SEO_QUERY_OCCUPIED_BY_PUBLISHED_PRODUCT_MESSAGE,
  catalogPickSeoPrimaryFields,
  catalogQueryNormalized,
  indexPublishedSeoOccupancy,
  lifecycleForSeoOpportunity,
  normalizeSeoQueryText,
  planSeoQueryReserve,
} from "../src/lib/seo-queries/published-query-occupancy.ts";
import { SEO_ACTIVE_RESERVATION_LIMIT } from "../src/lib/seo-queries/types.ts";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

const OLGA_AUTHOR_ID = "e46c5e7f-ddfe-4dec-8fcc-1b0685c7ba84";
const OLGA_PRACTICE_ID = "2703f630-fb17-471b-bc94-609518978bda";
const OLGA_QUERY_ID = "8e02aae6-d1bd-40ff-846b-86759717c5f1";
const OLGA_PRODUCT_TEXT = "Классическая музыка для работы";
const OLGA_CATALOG_TEXT = "классическая музыка для работы";
const OTHER_AUTHOR = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const opportunitiesUi = read(
  "src/components/author-dashboard/AuthorSeoOpportunitiesClient.tsx",
);
const reservationRoute = read("src/app/api/author/seo-reservations/route.ts");
const queriesLib = read("src/lib/seo-queries/queries.ts");
const discoveryRepo = read("src/lib/seo-queries/author-discovery-repository.ts");
const reserveMigration = read(
  "supabase/migrations/20261125120000_seo_reservation_published_occupancy.sql",
);
const linkMigration = read(
  "supabase/migrations/20261031120200_seo_reservation_link_music_gate.sql",
);
const attachMigration = read(
  "supabase/migrations/20261023120000_attach_published_seo_query_to_product.sql",
);
const backfillScript = read("scripts/seo-legacy-primary-query-backfill.mjs");
const backfillSql = read("scripts/sql/seo-legacy-primary-query-backfill-preview.sql");

function catalogQuery(partial = {}) {
  return {
    id: partial.id ?? OLGA_QUERY_ID,
    queryText: partial.queryText ?? OLGA_CATALOG_TEXT,
    normalizedQuery: partial.normalizedQuery ?? OLGA_CATALOG_TEXT,
  };
}

function practice(partial = {}) {
  return {
    id: partial.id ?? OLGA_PRACTICE_ID,
    authorId: partial.authorId ?? OLGA_AUTHOR_ID,
    title: partial.title ?? "Классика для работы",
    status: partial.status ?? "published",
    deletedAt: partial.deletedAt ?? null,
    primarySeoQueryId:
      partial.primarySeoQueryId === undefined
        ? null
        : partial.primarySeoQueryId,
    seoPrimaryQuery:
      partial.seoPrimaryQuery === undefined
        ? OLGA_PRODUCT_TEXT
        : partial.seoPrimaryQuery,
  };
}

function occupancyFor(queries, practices) {
  return indexPublishedSeoOccupancy({ queries, practices });
}

// CASE 1 — non-Aurafon music author + publication_class release can reserve.
assert.equal(isMusicCreateSeoDiscoveryEnabled({ authorId: OLGA_AUTHOR_ID }), false);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: OLGA_AUTHOR_ID,
    publicationClass: "release",
  }),
  true,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: OLGA_AUTHOR_ID,
    publicationClass: SEO_NON_AURAFON_RESERVATION_PUBLICATION_CLASS,
  }),
  true,
);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({
    authorId: OLGA_AUTHOR_ID,
    publicationClass: "practice",
  }),
  false,
);
assert.equal(isMusicCreateSeoDiscoveryEnabled({ authorId: AURAFON_AUTHOR_ID }), true);
assert.equal(
  planSeoQueryReserve({
    authorId: OLGA_AUTHOR_ID,
    queryId: OLGA_QUERY_ID,
    analysisStatus: "analyzed",
    activeReservationCount: 0,
    reservations: [],
    publishedOccupancy: false,
  }).action,
  "insert",
);

// CASE 2 — opportunities UI sends author, query, and the music-release class.
assert.match(opportunitiesUi, /author_id: authorId/);
assert.match(opportunitiesUi, /query_id: queryId/);
assert.match(
  opportunitiesUi,
  /publication_class: SEO_NON_AURAFON_RESERVATION_PUBLICATION_CLASS/,
);
assert.equal(SEO_NON_AURAFON_RESERVATION_PUBLICATION_CLASS, "release");
assert.match(reservationRoute, /publication_class/);
assert.match(reservationRoute, /isMusicCreateSeoDiscoveryEnabled/);

// CASE 3 — active reservation is the insert plan; SQL inserts one active row.
{
  const plan = planSeoQueryReserve({
    authorId: OLGA_AUTHOR_ID,
    queryId: "query-free",
    analysisStatus: "analyzed",
    activeReservationCount: 1,
    reservations: [],
    publishedOccupancy: false,
  });
  assert.equal(plan.action, "insert");
  assert.match(reserveMigration, /status = 'active'/);
  assert.match(
    reserveMigration,
    /INSERT INTO public\.seo_query_reservations/,
  );
}

// CASE 4 — already reserved by another author.
{
  const plan = planSeoQueryReserve({
    authorId: OLGA_AUTHOR_ID,
    queryId: "query-taken",
    analysisStatus: "analyzed",
    activeReservationCount: 0,
    reservations: [
      {
        id: "res-other",
        queryId: "query-taken",
        authorId: OTHER_AUTHOR,
        status: "active",
      },
    ],
    publishedOccupancy: false,
  });
  assert.equal(plan.action, "reject");
  assert.equal(plan.code, "seo_query_already_reserved");
  assert.match(reservationRoute, /Этот запрос уже взял другой автор/);
  assert.match(reserveMigration, /seo_query_already_reserved/);
}

// CASE 5 — active limit 5, clear error. used/released do not count.
assert.equal(SEO_ACTIVE_RESERVATION_LIMIT, 5);
{
  const plan = planSeoQueryReserve({
    authorId: OLGA_AUTHOR_ID,
    queryId: "query-new",
    analysisStatus: "analyzed",
    activeReservationCount: 5,
    reservations: [],
    publishedOccupancy: false,
  });
  assert.equal(plan.action, "reject");
  assert.equal(plan.code, "seo_reservation_limit_reached");
  assert.match(
    reservationRoute,
    /У вас уже 5 запросов в работе\. Завершите или освободите один из них\./,
  );
  assert.match(reserveMigration, /v_active_count >= 5/);
  assert.match(reserveMigration, /status = 'active'/);
  const released = planSeoQueryReserve({
    authorId: OLGA_AUTHOR_ID,
    queryId: "query-new",
    analysisStatus: "analyzed",
    activeReservationCount: 0,
    reservations: [
      {
        id: "res-released",
        queryId: "other",
        authorId: OLGA_AUTHOR_ID,
        status: "released",
      },
      {
        id: "res-used",
        queryId: "used-other",
        authorId: OLGA_AUTHOR_ID,
        status: "used",
      },
    ],
    publishedOccupancy: false,
  });
  assert.equal(released.action, "insert");
}

// CASE 6 — catalog pick saves text and primary_seo_query_id; free text does not.
{
  const picked = catalogPickSeoPrimaryFields({
    queryId: OLGA_QUERY_ID,
    queryText: OLGA_CATALOG_TEXT,
  });
  assert.equal(picked.seo_primary_query, OLGA_CATALOG_TEXT);
  assert.equal(picked.primary_seo_query_id, OLGA_QUERY_ID);
  const custom = catalogPickSeoPrimaryFields({
    queryId: null,
    queryText: "моя свободная фраза",
  });
  assert.equal(custom.seo_primary_query, "моя свободная фраза");
  assert.equal(custom.primary_seo_query_id, null);
  assert.match(linkMigration, /primary_seo_query_id = v_reservation\.query_id/);
  assert.match(linkMigration, /seo_primary_query = v_query\.query_text/);
  assert.match(attachMigration, /primary_seo_query_id = v_query\.id/);
  assert.match(attachMigration, /seo_primary_query = v_query\.query_text/);
}

// CASE 7 — published practice with primary_seo_query_id is not available.
{
  const queries = [catalogQuery()];
  const hits = occupancyFor(queries, [
    practice({ primarySeoQueryId: OLGA_QUERY_ID, seoPrimaryQuery: OLGA_CATALOG_TEXT }),
  ]);
  const hit = hits.get(OLGA_QUERY_ID);
  assert.equal(hit?.match, "primary_seo_query_id");
  assert.equal(
    lifecycleForSeoOpportunity({
      reservation: null,
      publishedOccupancy: hit,
    }),
    "published",
  );
  assert.notEqual(
    lifecycleForSeoOpportunity({
      reservation: null,
      publishedOccupancy: hit,
    }),
    "available",
  );
  const state = resolveAuthorDiscoveryReservationState({
    authorId: OTHER_AUTHOR,
    reservation: null,
    publishedOccupancy: {
      productId: hit.practiceId,
      authorId: hit.authorId,
      productTitle: hit.productTitle,
      match: hit.match,
    },
  });
  assert.equal(state.canReserve, false);
  assert.equal(state.status, "occupied");
}

// CASE 8 — Olga legacy: NULL fk, exact normalized text, not available.
{
  assert.equal(
    normalizeSeoQueryText(OLGA_PRODUCT_TEXT),
    normalizeSeoQueryText(OLGA_CATALOG_TEXT),
  );
  assert.equal(catalogQueryNormalized(catalogQuery()), "классическая музыка для работы");
  const hits = occupancyFor([catalogQuery()], [practice()]);
  const hit = hits.get(OLGA_QUERY_ID);
  assert.ok(hit, "Olga classic query must be occupied");
  assert.equal(hit.match, "legacy_exact_normalized_text");
  assert.equal(hit.practiceId, OLGA_PRACTICE_ID);
  assert.equal(hit.authorId, OLGA_AUTHOR_ID);
  assert.equal(
    lifecycleForSeoOpportunity({ reservation: null, publishedOccupancy: hit }),
    "published",
  );
  const hidden = isHiddenFromProductCreateDiscovery(null, {
    productId: hit.practiceId,
  });
  assert.equal(hidden, true);
}

// CASE 9 — similar but not exact normalized text stays free.
{
  const similar = [
    "классическая музыка для работы дома",
    "классическая музыка для работ",
    "классика для работы",
    "музыка для работы",
  ];
  for (const text of similar) {
    assert.notEqual(
      normalizeSeoQueryText(text),
      normalizeSeoQueryText(OLGA_CATALOG_TEXT),
    );
    const hits = occupancyFor(
      [catalogQuery()],
      [practice({ seoPrimaryQuery: text })],
    );
    assert.equal(hits.has(OLGA_QUERY_ID), false, text);
    assert.equal(
      lifecycleForSeoOpportunity({ reservation: null, publishedOccupancy: null }),
      "available",
    );
  }
  const draft = occupancyFor(
    [catalogQuery()],
    [practice({ status: "draft" })],
  );
  assert.equal(draft.has(OLGA_QUERY_ID), false);
}

// CASE 10 — used reservation is occupied and hidden from product create.
{
  const used = {
    id: "res-used",
    authorId: OLGA_AUTHOR_ID,
    status: "used",
    productId: OLGA_PRACTICE_ID,
    productTitle: "Альбом",
  };
  assert.equal(isHiddenFromProductCreateDiscovery(used), true);
  assert.equal(
    lifecycleForSeoOpportunity({
      reservation: { status: "used" },
      product: { status: "published" },
    }),
    "published",
  );
  const state = resolveAuthorDiscoveryReservationState({
    authorId: OTHER_AUTHOR,
    reservation: used,
  });
  assert.equal(state.status, "occupied");
  assert.equal(state.canReserve, false);
}

// CASE 11 — released / expired unlinked becomes available again.
{
  assert.equal(
    lifecycleForSeoOpportunity({ reservation: null, publishedOccupancy: null }),
    "available",
  );
  assert.equal(isHiddenFromProductCreateDiscovery(null), false);
  const plan = planSeoQueryReserve({
    authorId: OLGA_AUTHOR_ID,
    queryId: "query-released",
    analysisStatus: "analyzed",
    activeReservationCount: 0,
    reservations: [
      {
        id: "res-old",
        queryId: "query-released",
        authorId: OLGA_AUTHOR_ID,
        status: "released",
      },
    ],
    publishedOccupancy: false,
  });
  assert.equal(plan.action, "insert");
  assert.match(reserveMigration, /expire_seo_query_reservation/);
}

// CASE 12 — top-7 after hiding used reservations and published occupancy.
{
  const items = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"].map(
    (id) => ({
      id,
      queryText: `джаз ${id}`,
      normalizedQuery: `джаз ${id}`,
      frequency: 100,
      reservation:
        id === "2" || id === "5"
          ? {
              id: `res-${id}`,
              authorId: OLGA_AUTHOR_ID,
              status: "used",
              productId: `prod-${id}`,
            }
          : null,
      publishedOccupancy:
        id === "3" || id === "7"
          ? {
              productId: `legacy-${id}`,
              authorId: OTHER_AUTHOR,
              productTitle: null,
              match: "legacy_exact_normalized_text",
            }
          : null,
    }),
  );
  const walked = takeRankedDiscoveryItemsUntilVisible({
    surface: AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE,
    items,
    visibleLimit: SEO_DISCOVERY_DATABASE_LIMIT,
  });
  const built = buildAuthorDiscoveryDatabaseMatches({
    surface: "product_create",
    authorId: OLGA_AUTHOR_ID,
    items: walked,
    visibleLimit: SEO_DISCOVERY_DATABASE_LIMIT,
  });
  assert.equal(SEO_DISCOVERY_DATABASE_LIMIT, 7);
  assert.equal(built.matches.length, 7);
  assert.deepEqual(
    built.matches.map((item) => item.phrase),
    ["джаз 1", "джаз 4", "джаз 6", "джаз 8", "джаз 9", "джаз 10", "джаз 11"],
  );
  assert.ok(built.hiddenNormalizedQueries.includes("джаз 2"));
  assert.ok(built.hiddenNormalizedQueries.includes("джаз 3"));
  assert.ok(built.hiddenNormalizedQueries.includes("джаз 7"));
  assert.equal(built.matches.every((item) => item.canReserve), true);
}

// CASE 13 — re-submit does not create a second reservation; link stays idempotent.
{
  const plan = planSeoQueryReserve({
    authorId: OLGA_AUTHOR_ID,
    queryId: "query-own",
    analysisStatus: "analyzed",
    activeReservationCount: 5,
    reservations: [
      {
        id: "res-own",
        queryId: "query-own",
        authorId: OLGA_AUTHOR_ID,
        status: "active",
      },
    ],
    publishedOccupancy: false,
  });
  assert.equal(plan.action, "return_existing");
  assert.equal(plan.reservationId, "res-own");
  const ownReturn = reserveMigration.indexOf("RETURN v_reservation");
  const insertAt = reserveMigration.indexOf("INSERT INTO public.seo_query_reservations");
  assert.ok(ownReturn > 0 && ownReturn < insertAt);
  assert.match(reserveMigration, /author_id = p_author_id/);
  assert.match(reserveMigration, /status = 'active'/);
  assert.match(linkMigration, /idempotent for same product|Idempotent: already linked/);
  assert.match(
    linkMigration,
    /v_reservation\.product_id IS NOT DISTINCT FROM p_product_id/,
  );
}

// Published occupancy is consulted before the available lifecycle.
assert.match(queriesLib, /loadPublishedSeoOccupancyForQueries/);
assert.match(queriesLib, /lifecycleForSeoOpportunity/);
const occupancyCall = queriesLib.indexOf("loadPublishedSeoOccupancyForQueries");
const lifecycleCall = queriesLib.indexOf("lifecycleForSeoOpportunity");
assert.ok(occupancyCall > 0 && occupancyCall < lifecycleCall);
assert.match(discoveryRepo, /loadPublishedSeoOccupancyForQueries/);
assert.match(discoveryRepo, /publishedOccupancy/);
const repoOccupancy = discoveryRepo.indexOf("loadPublishedSeoOccupancyForQueries");
const repoHide = discoveryRepo.indexOf("isHiddenFromProductCreateDiscovery");
assert.ok(repoOccupancy > 0 && repoOccupancy < repoHide);

// API returns a human message for the beta gate and published occupancy.
assert.match(reservationRoute, /SEO_DISCOVERY_BETA_DISABLED_MESSAGE/);
assert.match(reservationRoute, /code: "seo_discovery_beta_disabled"/);
assert.match(reservationRoute, /SEO_QUERY_OCCUPIED_BY_PUBLISHED_PRODUCT_MESSAGE/);
assert.equal(
  SEO_DISCOVERY_BETA_DISABLED_MESSAGE.includes("музыкальных релизов"),
  true,
);
assert.equal(
  SEO_QUERY_OCCUPIED_BY_PUBLISHED_PRODUCT_MESSAGE.includes("опубликованным продуктом"),
  true,
);
assert.match(opportunitiesUi, /payload\.message/);

// Legacy backfill script is dry-run by default and is not a CI test script.
assert.match(backfillScript, /dry-run/);
assert.match(backfillScript, /localhost/);
assert.doesNotMatch(backfillSql, /UPDATE public\.practices/);
assert.match(backfillSql, /practice_id/);
assert.match(backfillSql, /matched_query_id/);
assert.match(backfillSql, /reservation_status/);
assert.match(backfillSql, /conflict/);
assert.equal(resolveBackfillMode(["node", "script"]).mode, "dry-run");
assert.equal(
  resolveBackfillMode(["node", "script", "--write"], {}).mode,
  "refuse",
);
assert.equal(
  resolveBackfillMode(["node", "script", "--write"], {
    SEO_LEGACY_BACKFILL_DATABASE_URL: "postgresql://postgres@72.56.232.160:5432/postgres",
    SEO_LEGACY_BACKFILL_CONFIRM: "localhost-only",
  }).mode,
  "refuse",
);
assert.match(reserveMigration, /No seed\. No backfill/);
assert.doesNotMatch(reserveMigration, /\bUPDATE public\.practices\b/);

console.log("seo-query-claim-occupancy-unit: ok");
