#!/usr/bin/env node
/**
 * Focused unit: SEO discovery in product create (Aurafon closed beta) + UX/data cleanup.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SEO_QUERY_SKIP_PARAM,
  SEO_QUERY_SKIP_VALUE,
  SEO_RESERVATION_ID_PARAM,
  buildAuthorProductCreateHref,
  buildSeoReservationProductCreateHref,
  isSeoQuerySkipParam,
} from "../src/lib/seo-queries/reservation-product-create-href.ts";
import { getProductSeoQueryStepCopy } from "../src/lib/seo-queries/product-seo-query-step-copy.ts";
import { isProductCreateSeoDiscoveryEnabled } from "../src/lib/seo-queries/discovery-beta.ts";
import { authorDiscoveryRowAfterOwnReservationRelease } from "../src/lib/seo-queries/author-discovery-status.ts";
import {
  RELEASE_SEO_QUERY_FALLBACK_MESSAGE,
  activeReservationCountAfterRelease,
  opportunitiesAfterOwnReservationRelease,
  releaseSeoQueryConfirmCopy,
  requestReleaseSeoReservation,
  selectOwnUnlinkedSeoOpportunities,
} from "../src/lib/seo-queries/release-own-seo-reservation.ts";
import { countActiveAuthorSeoReservations } from "../src/lib/seo-queries/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const dash = read("src/components/author-dashboard/AuthorDashboardClient.tsx");
const dashPage = read("src/app/(platform)/author-dashboard/page.tsx");
const createPage = read("src/app/(platform)/author-dashboard/products/new/page.tsx");
const createStep = read("src/components/author-dashboard/AuthorProductSeoQueryStep.tsx");
const panel = read("src/components/author-dashboard/AuthorSeoDiscoveryPanel.tsx");
const wizard = read("src/components/author-dashboard/AuthorCreateWizard.tsx");
const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
const opportunitiesUi = read("src/components/author-dashboard/AuthorSeoOpportunitiesClient.tsx");
const discoveryRoute = read("src/app/api/author/seo/discovery/route.ts");
const reservationRoute = read("src/app/api/author/seo-reservations/route.ts");
const transferReservationRoute = read(
  "src/app/api/author/seo-reservations/transfer/route.ts",
);
const releaseLib = read("src/lib/seo-queries/release-own-seo-reservation.ts");
const queriesLib = read("src/lib/seo-queries/queries.ts");

// --- Dashboard: discovery removed ---
assert.doesNotMatch(dash, /AuthorSeoDiscoveryPanel/);
assert.doesNotMatch(dash, /Найдите тему/);
assert.doesNotMatch(dash, /seoActiveReservationCounts/);
assert.doesNotMatch(dashPage, /listSeoOpportunitiesForAuthor/);
assert.doesNotMatch(dashPage, /seoActiveReservationCounts/);
assert.doesNotMatch(dashPage, /isAuthorSeoDiscoveryEnabled/);

assert.match(nav, /Что ищут слушатели/);
assert.match(opportunitiesUi, /variant="opportunities"/);

// --- Product-create gate: music + practice open; course/audiobook/post closed ---
const OTHER_AUTHOR = "00000000-0000-4000-8000-000000000099";
assert.equal(
  isProductCreateSeoDiscoveryEnabled({
    authorId: OTHER_AUTHOR,
    publicationClass: "release",
  }),
  true,
);
assert.equal(
  isProductCreateSeoDiscoveryEnabled({
    authorId: OTHER_AUTHOR,
    publicationClass: "practice",
  }),
  true,
);
for (const publicationClass of ["course", "audiobook", "post", null]) {
  assert.equal(
    isProductCreateSeoDiscoveryEnabled({
      authorId: OTHER_AUTHOR,
      publicationClass,
    }),
    false,
    `product create discovery must stay closed for ${publicationClass}`,
  );
}

// --- URL helpers ---
assert.equal(SEO_RESERVATION_ID_PARAM, "seo_reservation_id");
assert.equal(SEO_QUERY_SKIP_PARAM, "seo_query");
assert.equal(SEO_QUERY_SKIP_VALUE, "skip");
assert.equal(isSeoQuerySkipParam("skip"), true);
assert.equal(isSeoQuerySkipParam("SKIP"), true);
assert.equal(isSeoQuerySkipParam("no"), false);

assert.equal(
  buildAuthorProductCreateHref({
    authorSlug: "aurafon",
    publicationClass: "release",
  }),
  "/author-dashboard/products/new?author=aurafon&class=release",
);
assert.equal(
  buildAuthorProductCreateHref({
    authorSlug: "aurafon",
    publicationClass: "release",
    seoQuerySkip: true,
  }),
  "/author-dashboard/products/new?author=aurafon&seo_query=skip&class=release",
);
assert.equal(
  buildAuthorProductCreateHref({
    authorSlug: "aurafon",
    publicationClass: "release",
    reservationId: "rid-1",
    seoQuerySkip: true,
  }),
  "/author-dashboard/products/new?author=aurafon&seo_reservation_id=rid-1&class=release",
);
assert.equal(
  buildSeoReservationProductCreateHref({
    authorSlug: "aurafon",
    reservationId: "11111111-1111-1111-1111-111111111111",
    publicationClass: "release",
    step: 1,
  }),
  "/author-dashboard/products/new?author=aurafon&seo_reservation_id=11111111-1111-1111-1111-111111111111&class=release&step=1",
);
assert.doesNotMatch(
  buildAuthorProductCreateHref({
    authorSlug: "aurafon",
    reservationId: "rid",
    publicationClass: "release",
  }),
  /query_text|q=|текст/i,
);

// --- Create page orchestration (I) ---
assert.match(createPage, /AuthorProductSeoQueryStep/);
assert.match(createPage, /isProductCreateSeoDiscoveryEnabled/);
assert.match(createPage, /isSeoQuerySkipParam/);
assert.match(createPage, /listSeoOpportunitiesForAuthor/);
assert.match(createPage, /listActiveSeoReservationsForWorkspaces/);
assert.match(createPage, /otherWorkspaceReservations/);
assert.match(createPage, /authorName=\{initialAuthor\.name\}/);
assert.match(createPage, /AuthorCreateWizard/);
assert.match(createPage, /if \(!publicationClass\)/);
assert.match(createPage, /seoQueryStepEnabled && !hasValidReservation && !seoQuerySkip/);
assert.match(createPage, /AuthorProductForm/);
assert.match(createPage, /initialSeoReservationContext/);
assert.match(createPage, /formBackHref = seoQueryStepEnabled \? queryStepHref : typeChooserHref/);
assert.match(createPage, /internalBackHref=\{typeChooserHref\}/);

// --- Query step structure ---
assert.match(createStep, /Ваши запросы в работе/);
assert.match(createStep, /selectOwnUnlinkedSeoOpportunities/);
assert.match(createStep, /Забронировано в других авторских пространствах/);
assert.match(createStep, /Авторское пространство:/);
assert.match(createStep, /Перенести в/);
assert.match(createStep, /Открыть «\{item\.authorName\}»/);
assert.match(createStep, /transferSeoReservationToWorkspace/);
assert.match(createStep, /transferAndContinue/);
assert.match(createStep, /otherWorkspaceReservations/);
assert.match(createStep, /authorSlug:\s*item\.authorSlug/);
assert.match(createStep, /reservationId:\s*item\.reservationId/);
assert.match(queriesLib, /listActiveSeoReservationsForWorkspaces/);
assert.match(queriesLib, /\.in\("author_id", authorIds\)/);
assert.match(queriesLib, /\.eq\("status", "active"\)/);
assert.match(queriesLib, /\.is\("product_id", null\)/);
assert.match(queriesLib, /isEffectiveSeoReservation/);
assert.match(transferReservationRoute, /transfer_seo_query_reservation/);
assert.match(transferReservationRoute, /target_author_id/);
assert.match(transferReservationRoute, /requireAuthorMutationMembership/);
assert.match(transferReservationRoute, /seo_reservation_limit_reached/);
assert.match(releaseLib, /!item\.productId/);
assert.match(releaseLib, /item\.lifecycle !== "published"/);
assert.match(createStep, /variant="product-create"/);
assert.match(createStep, /seoQuerySkip:\s*true/);
assert.match(createStep, /AuthorSeoPromptBuilder/);
assert.match(createStep, /analyzedOpportunities=\{visibleOpportunities\}/);
assert.doesNotMatch(createStep, /from\("practices"\)/);
assert.doesNotMatch(createStep, /\/api\/author\/products/);

// A — skip after discovery panel, not duplicated
const skipIdx = createStep.indexOf("Продолжить без поискового запроса");
const panelIdx = createStep.indexOf("AuthorSeoDiscoveryPanel");
assert.ok(panelIdx > 0, "discovery panel present");
assert.ok(skipIdx > panelIdx, "skip action after AuthorSeoDiscoveryPanel");
assert.equal(
  (createStep.match(/Продолжить без поискового запроса/g) || []).length,
  1,
  "skip not duplicated",
);
assert.match(createStep, /data-testid="author-product-seo-query-skip"/);
assert.doesNotMatch(
  createStep.slice(0, panelIdx),
  /Продолжить без поискового запроса/,
);

// B/C — release music copy
const releaseCopy = getProductSeoQueryStepCopy("release");
assert.equal(releaseCopy.title, "Выберите поисковый запрос для музыки");
assert.match(releaseCopy.description, /создаёте музыку/);
assert.match(createStep, /getProductSeoQueryStepCopy/);
assert.match(createStep, /copy\.title/);

// D — practice-specific copy; other product classes keep generic copy
const practiceCopy = getProductSeoQueryStepCopy("practice");
assert.equal(practiceCopy.title, "Выберите поисковый запрос для практики");
assert.match(practiceCopy.description, /создаёте практику/);
assert.doesNotMatch(practiceCopy.description, /создаёте музыку/);
assert.equal(getProductSeoQueryStepCopy("course").title, "Выберите поисковый запрос");
assert.equal(getProductSeoQueryStepCopy(undefined).title, "Выберите поисковый запрос");

// E — database frequency NULL stays null in API DTO
const discoveryStatus = read("src/lib/seo-queries/author-discovery-status.ts");
assert.match(
  discoveryStatus,
  /frequency:\s*typeof item\.frequency === "number" \? item\.frequency : null/,
);
assert.doesNotMatch(discoveryRoute, /frequency:\s*item\.frequency \?\? 0/);
assert.doesNotMatch(discoveryStatus, /frequency:\s*item\.frequency \?\? 0/);

// F/G — null-safe frequency display; Wordstat label template retained
assert.match(panel, /frequency:\s*number\s*\|\s*null/);
assert.match(panel, /function formatMonthlyFrequency\(value: number \| null\)/);
assert.match(panel, /if \(value === null \|\| Number\.isNaN\(value\)\) return null/);
assert.match(panel, /Запросов в месяц:/);
assert.doesNotMatch(panel, /Запросов в месяц: 0/);
assert.doesNotMatch(createStep, /Запросов в месяц: 0/);
assert.match(createStep, /function formatMonthlyFrequency\(value: number \| null\)/);

// H — own unlinked pre-create status
assert.match(createStep, /У вас в работе/);
assert.doesNotMatch(createStep, /lifecycleLabel/);

// Discovery product-create CTAs
assert.match(panel, /"opportunities" \| "product-create"/);
assert.doesNotMatch(panel, /"dashboard"/);
assert.doesNotMatch(panel, /Взять в работу и продолжить/);
assert.match(panel, /Взять в работу/);
assert.doesNotMatch(panel, />\s*"Взять в работу"\s*</);
assert.match(panel, /Выбрать и продолжить/);
assert.match(panel, /buildAuthorProductCreateHref/);
assert.doesNotMatch(panel, /router\.push/);
assert.doesNotMatch(panel, /!isProductCreate\s*&&\s*item\.status === "own"/);
assert.match(panel, /Сформируйте SEO-промпт или продолжите создание продукта/);
assert.match(panel, /AuthorSeoPromptBuilder/);

assert.match(wizard, /buildAuthorProductCreateHref/);
assert.match(wizard, /reservationId:\s*input\.seoReservationId/);
assert.doesNotMatch(wizard, /PRODUCT_OPTIONS/);
assert.doesNotMatch(wizard, /Какой продукт создать\?/);
assert.doesNotMatch(wizard, /Назад к выбору ветки/);
assert.match(
  wizard,
  /option\.value === CABINET_BRANCH\.PRODUCT[\s\S]*\? "practice"/,
);

// Zero migrations for this feature
const migDir = path.join(root, "supabase/migrations");
const migNames = readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort();
assert.ok(migNames.includes("20261021120000_seo_reservation_product_primary_sync.sql"));
assert.ok(migNames.includes("20261022120000_seo_spa_massage_queries_seed.sql"));
const afterSpa = migNames.filter((n) => n > "20261022120000_seo_spa_massage_queries_seed.sql");
for (const name of afterSpa) {
  const body = read(`supabase/migrations/${name}`);
  assert.doesNotMatch(body, /author-create-seo-query|seo_query.?skip|product-create/i);
}

// --- Release own unlinked query on the pre-create step ---
assert.match(reservationRoute, /release_seo_query_reservation/);
assert.match(reservationRoute, /export async function DELETE/);
assert.doesNotMatch(releaseLib, /supabase\.rpc/);
assert.doesNotMatch(createStep, /supabase\.rpc/);
assert.doesNotMatch(createStep, /Удалить|Отменить SEO/);
assert.match(createStep, /Освободить запрос/);
assert.match(createStep, /Освобождаем…/);
assert.match(createStep, /Выбрать и продолжить/);
assert.match(createStep, /requestReleaseSeoReservation/);
assert.match(createStep, /activeReservationCount=\{activeCount\}/);
assert.match(createStep, /releasedReservationIds=\{releasedReservationIds\}/);
assert.match(createStep, /router\.refresh\(\)/);
assert.match(panel, /authorDiscoveryRowAfterOwnReservationRelease/);
assert.match(panel, /releasedReservationIds/);

const releaseButton = createStep.slice(
  Math.max(0, createStep.indexOf('data-testid="author-product-seo-query-release"') - 500),
  createStep.indexOf('data-testid="author-product-seo-query-release"'),
);
assert.match(releaseButton, /border border-\[#bda6e1\]/);
assert.doesNotMatch(releaseButton, /d64545|destructive|bg-red/);
assert.match(releaseButton, /setConfirmTarget\(item\)/);
assert.doesNotMatch(releaseButton, /requestReleaseSeoReservation/);

const confirmFn = createStep.slice(
  createStep.indexOf("async function confirmRelease"),
  createStep.indexOf("return ("),
);
assert.match(confirmFn, /publicationClass/);
assert.ok(
  confirmFn.indexOf("if (!result.ok)") < confirmFn.indexOf("setReleasedReservationIds"),
  "failed DELETE does not drop the reservation",
);
assert.ok(
  confirmFn.indexOf("if (!result.ok)") < confirmFn.indexOf("router.refresh"),
  "refresh only after successful DELETE",
);

const confirmCopy = releaseSeoQueryConfirmCopy("музыка для сна");
assert.equal(confirmCopy.title, "Освободить запрос „музыка для сна“?");
assert.equal(confirmCopy.description, "Он снова станет доступен другим авторам.");
assert.match(createStep, /Отмена/);
assert.match(createStep, />\s*\{pendingId \? "Освобождаем…" : "Освободить"\}\s*</);

function opportunity(overrides) {
  return {
    id: "q-own",
    queryText: "музыка для сна",
    source: "manual",
    frequency: 1200,
    clusterName: null,
    intent: null,
    recommendedFormat: null,
    audioFit: null,
    lifecycle: "in_progress",
    reservationId: "res-own",
    expiresAt: "2026-10-01T00:00:00.000Z",
    productId: null,
    productTitle: null,
    ...overrides,
  };
}

const own = opportunity({});
const published = opportunity({
  id: "q-published",
  queryText: "вечерний джаз",
  lifecycle: "published",
  reservationId: "res-published",
  productId: "prod-1",
  productTitle: "Вечерний джаз",
});
const linked = opportunity({
  id: "q-linked",
  queryText: "джаз для отдыха",
  reservationId: "res-linked",
  productId: "prod-draft",
  productTitle: "Черновик",
});
const otherOwn = opportunity({
  id: "q-other",
  queryText: "музыка для медитации",
  reservationId: "res-other",
});
const block = selectOwnUnlinkedSeoOpportunities([own, published, linked, otherOwn]);
assert.deepEqual(
  block.map((item) => item.reservationId),
  ["res-own", "res-other"],
  "published and product-linked stay out of the block",
);

const beforeCount = countActiveAuthorSeoReservations([own, published, linked, otherOwn]);
assert.equal(beforeCount, 3);
const releasedItems = opportunitiesAfterOwnReservationRelease(
  [own, published, linked, otherOwn],
  ["res-own"],
);
assert.equal(
  selectOwnUnlinkedSeoOpportunities(releasedItems).some((item) => item.reservationId === "res-own"),
  false,
  "successful release removes the card",
);
assert.equal(
  selectOwnUnlinkedSeoOpportunities(releasedItems).map((item) => item.reservationId).join(","),
  "res-other",
);
assert.equal(countActiveAuthorSeoReservations(releasedItems), beforeCount - 1);
assert.equal(
  activeReservationCountAfterRelease([own, published, linked, otherOwn], ["res-own"], true),
  beforeCount - 1,
);
assert.equal(
  activeReservationCountAfterRelease([own, published, linked, otherOwn], ["res-own"], false),
  beforeCount,
  "failed DELETE keeps the count",
);
assert.equal(activeReservationCountAfterRelease([], ["missing"], true), 0);
assert.equal(
  selectOwnUnlinkedSeoOpportunities(
    opportunitiesAfterOwnReservationRelease([own], ["res-own"]),
  ).length,
  0,
);

const calls = [];
const released = await requestReleaseSeoReservation({
  authorId: "author-1",
  reservationId: "res-own",
  publicationClass: "release",
  fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ reservation: { id: "res-own" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
assert.equal(released.ok, true);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, "/api/author/seo-reservations");
assert.equal(calls[0].init.method, "DELETE");
assert.deepEqual(JSON.parse(calls[0].init.body), {
  author_id: "author-1",
  reservation_id: "res-own",
  publication_class: "release",
});

const lifecycleLocked = await requestReleaseSeoReservation({
  authorId: "author-1",
  reservationId: "res-own",
  publicationClass: "release",
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        error: "seo_reservation_product_lifecycle_locked",
        message:
          "Запрос нельзя освободить после отправки продукта на модерацию или публикации.",
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    ),
});
assert.equal(lifecycleLocked.ok, false);
assert.equal(
  lifecycleLocked.message,
  "Запрос нельзя освободить после отправки продукта на модерацию или публикации.",
);

const unnamedFailure = await requestReleaseSeoReservation({
  authorId: "author-1",
  reservationId: "res-own",
  publicationClass: "release",
  fetchImpl: async () =>
    new Response(JSON.stringify({ error: "seo_reservation_release_failed" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
});
assert.equal(unnamedFailure.ok, false);
assert.equal(unnamedFailure.message, RELEASE_SEO_QUERY_FALLBACK_MESSAGE);
assert.equal(unnamedFailure.message, "Не удалось освободить запрос.");

const ownDiscovery = {
  phrase: "музыка для сна",
  frequency: 1200,
  status: "own",
  statusLabel: "У вас в работе",
  canReserve: false,
  canPropose: false,
  queryId: "q-own",
  reservationId: "res-own",
  productId: null,
  productTitle: null,
};
const clearedDiscovery = authorDiscoveryRowAfterOwnReservationRelease(
  ownDiscovery,
  new Set(["res-own"]),
);
assert.equal(clearedDiscovery.status, "available");
assert.equal(clearedDiscovery.statusLabel, "Свободен");
assert.equal(clearedDiscovery.canReserve, true);
assert.equal(clearedDiscovery.reservationId, null);
assert.notEqual(clearedDiscovery.statusLabel, "У вас в работе");
assert.equal(
  authorDiscoveryRowAfterOwnReservationRelease(ownDiscovery, new Set()).statusLabel,
  "У вас в работе",
);
assert.equal(
  authorDiscoveryRowAfterOwnReservationRelease(
    {
      ...ownDiscovery,
      status: "published",
      statusLabel: "Опубликован",
      productId: "prod-1",
      productTitle: "Вечерний джаз",
    },
    new Set(["res-published"]),
  ).statusLabel,
  "Опубликован",
);
assert.equal(
  authorDiscoveryRowAfterOwnReservationRelease(
    { ...ownDiscovery, reservationId: "res-linked", productId: "prod-draft", productTitle: "Черновик" },
    new Set(["res-linked"]),
  ).statusLabel,
  "У вас в работе",
);

const opportunitiesRelease = opportunitiesUi.slice(
  opportunitiesUi.indexOf("async function release"),
  opportunitiesUi.indexOf("async function link"),
);
assert.match(opportunitiesRelease, /method: "DELETE"/);
assert.match(opportunitiesRelease, /buildReleaseSeoReservationBody/);
assert.match(
  opportunitiesRelease,
  /publicationClass: SEO_NON_AURAFON_RESERVATION_PUBLICATION_CLASS/,
);
assert.match(opportunitiesRelease, /releaseSeoReservationErrorMessage/);
assert.match(opportunitiesRelease, /lifecycle: "available"/);
assert.match(opportunitiesUi, />Освободить<\/button>/);

console.log("author-create-seo-query-step-unit: ok");
