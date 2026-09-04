#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { projectAppreciationAnalytics } from "@/lib/admin/appreciation-analytics";
import { overlayAppreciationFinanceRows } from "@/lib/author-finance/appreciation";
import {
  AUTHOR_APPRECIATION_ROW_LABEL,
  AUTHOR_APPRECIATION_SECTION_TITLE,
  AUTHOR_APPRECIATION_SURFACE_AUTHOR_LABEL,
  filterAuthorAppreciationFactsForAuthor,
  getAuthorAppreciationFinanceStatusLabel,
  isAuthorVisibleAppreciationIntent,
  projectAuthorAppreciationCabinet,
  type AuthorAppreciationCabinetFact,
} from "@/lib/author-finance/appreciation-cabinet";
import {
  assertAppreciationCsvHasNoSensitiveText,
  buildAuthorAppreciationCsv,
  isAuthorFinanceExportKind,
} from "@/lib/author-finance/csv";
import {
  createAuthorFinanceAppreciationListHandler,
  createAuthorFinanceExportHandler,
} from "@/lib/author-finance/route-handlers";
import type { AuthorFinanceLedgerRow } from "@/lib/author-finance/types";
import { buildAuthorSalesCsv } from "@/lib/author-sales/csv";
import {
  attachAppreciationToProducts,
  attachAppreciationToSummary,
  attachAppreciationToTimeseries,
  isAuthorSurfaceFact,
  isProductSurfaceFact,
  summarizeAppreciationStats,
} from "@/lib/author-stats/appreciation";
import type {
  AuthorStatsProductRow,
  AuthorStatsSummary,
  AuthorStatsTimeseriesPoint,
} from "@/lib/author-stats/types";
import { authorShareMinor, platformShareMinor } from "@/lib/payments/author-finance/types";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const SERGEY_AUTHOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ZOYA_AUTHOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_AUTHOR_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = new Date("2026-09-04T04:00:00.000Z");

const SERGEY_INTENT_ID = "803348fb-59af-49bc-8127-c491b2e9c360";
const ZOYA_INTENT_ID = "96c9eb2-a0b0-4f4e-bfd7-7b17c42f7e11";

function paidFact(
  overrides: Partial<AuthorAppreciationCabinetFact> &
    Pick<AuthorAppreciationCabinetFact, "intentId" | "authorId" | "surface">,
): AuthorAppreciationCabinetFact {
  return {
    intentStatus: "paid",
    sourceTitle: overrides.surface === "product" ? "Продукт" : "Автор",
    practiceId: overrides.surface === "product" ? "practice-1" : null,
    practiceSlug: overrides.surface === "product" ? "product-slug" : null,
    amountMinor: 10_000,
    createdAt: "2026-09-04T03:20:00.000Z",
    paidAt: "2026-09-04T03:37:55.000Z",
    currency: "RUB",
    hasSaleAccrual: true,
    authorAccruedMinor: 7_000,
    availableAt: "2026-09-18T03:37:55.000Z",
    payoutAllocationStatus: null,
    ...overrides,
  };
}

const sergey = paidFact({
  intentId: SERGEY_INTENT_ID,
  authorId: SERGEY_AUTHOR_ID,
  surface: "author",
  sourceTitle: "Сергей",
});

const zoya = paidFact({
  intentId: ZOYA_INTENT_ID,
  authorId: ZOYA_AUTHOR_ID,
  surface: "product",
  sourceTitle: "Прогноз от Высшего Я на сентябрь 2026",
  practiceId: "practice-zoya",
  practiceSlug: "prognoz-vysshee-ya-sentyabr-2026",
});

function emptySummary(): AuthorStatsSummary {
  return {
    authorPageViews: 0,
    authorPageUniqueVisitors: 0,
    practiceViews: 0,
    practiceUniqueVisitors: 0,
    plays: 0,
    progress25: 0,
    completions: 0,
    librarySaves: 0,
    grossPurchases: 1,
    refundSales: 0,
    fullRefunds: 0,
    partialRefunds: 0,
    netSales: 1,
    grossRevenueMinor: 50_000,
    refundedAmountMinor: 0,
    netRevenueMinor: 50_000,
    viewToPlayRate: null,
    playToCompleteRate: null,
    viewToSaveRate: null,
    viewToPurchaseRate: null,
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
  };
}

function emptyProduct(slug: string, title: string): AuthorStatsProductRow {
  return {
    productSlug: slug,
    title,
    slug,
    status: "published",
    isFree: false,
    price: 500,
    practiceViews: 0,
    practiceUniqueVisitors: 0,
    plays: 0,
    progress25: 0,
    completions: 0,
    librarySaves: 0,
    grossPurchases: 0,
    refundSales: 0,
    fullRefunds: 0,
    partialRefunds: 0,
    netSales: 0,
    grossRevenueMinor: 0,
    refundedAmountMinor: 0,
    netRevenueMinor: 0,
    viewToPlayRate: null,
    playToCompleteRate: null,
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
  };
}

function emptyPoint(date: string): AuthorStatsTimeseriesPoint {
  return {
    date,
    practiceViews: 0,
    practiceUniqueVisitors: 0,
    plays: 0,
    progress25: 0,
    completions: 0,
    librarySaves: 0,
    grossPurchases: 1,
    refundSales: 0,
    fullRefunds: 0,
    partialRefunds: 0,
    netSales: 1,
    authorPageViews: 0,
    authorPageUniqueVisitors: 0,
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
  };
}

function test1OrdinarySaleOnlyAsSale() {
  const saleRow: AuthorFinanceLedgerRow = {
    entryId: "sale-ordinary",
    typeKey: "sale",
    amountMinor: 7_000,
    currency: "RUB",
    effectiveAt: "2026-09-01T00:00:00.000Z",
    availableAt: "2026-09-15T00:00:00.000Z",
    isHeld: true,
    amountState: "held",
    productTitle: "Обычный продукт",
    payoutSafeRef: null,
    publicComment: null,
  };
  const overlaid = overlayAppreciationFinanceRows([saleRow], new Set());
  assert.equal(overlaid[0].typeKey, "sale");
  assert.notEqual(overlaid[0].typeKey, "appreciation");

  const sales = read("src/lib/author-sales/queries.ts");
  assert.match(sales, /author_canonical_sales_list/);
  assert.match(sales, /author_canonical_sales_counts/);
  assert.doesNotMatch(sales, /author_appreciation_payment_intents/);
  assert.doesNotMatch(
    read("src/components/author-dashboard/AuthorSalesSection.tsx"),
    /appreciation/,
  );
}

function test2AppreciationInAuthorList() {
  const { rows, summary } = projectAuthorAppreciationCabinet([sergey, zoya], NOW);
  assert.equal(rows.length, 2);
  assert.equal(summary.confirmedCount, 2);

  const sergeyRow = rows.find((row) => row.id === SERGEY_INTENT_ID);
  const zoyaRow = rows.find((row) => row.id === ZOYA_INTENT_ID);
  assert.ok(sergeyRow);
  assert.ok(zoyaRow);
  assert.equal(sergeyRow.sourceTitle, AUTHOR_APPRECIATION_SURFACE_AUTHOR_LABEL);
  assert.equal(zoyaRow.sourceTitle, "Прогноз от Высшего Я на сентябрь 2026");
  assert.equal(sergeyRow.grossAmountMinor, 10_000);
  assert.equal(sergeyRow.authorAccruedMinor, 7_000);
  assert.equal(zoyaRow.grossAmountMinor, 10_000);
  assert.equal(zoyaRow.authorAccruedMinor, 7_000);
  assert.equal(sergeyRow.financeStatus, "held");
  assert.equal(zoyaRow.financeStatus, "held");
}

function test3SaleAccrualAffectsFinanceExactlyOnce() {
  const { summary } = projectAuthorAppreciationCabinet([sergey], NOW);
  assert.equal(summary.authorAccruedMinor, 7_000);
  assert.equal(summary.heldMinor, 7_000);
  assert.equal(summary.availableMinor, 0);

  const queries = read("src/lib/author-finance/queries.ts");
  assert.match(queries, /getAuthorSalesCounts/);
  assert.match(queries, /saleCount = sales.grossPurchases/);
  assert.doesNotMatch(queries, /accruedMinor \+= .*appreciation/);
  assert.doesNotMatch(queries, /appreciationGrossMinor/);
  assert.match(queries, /overlayAppreciationFinanceRows/);

  const financeClient = read("src/components/author-dashboard/AuthorFinanceClient.tsx");
  assert.match(financeClient, /AuthorAppreciationSection/);
  assert.match(financeClient, /AuthorSalesSection/);
}

function test4DoesNotInflateOrdinarySales() {
  const summary = attachAppreciationToSummary(
    emptySummary(),
    summarizeAppreciationStats([sergey, zoya]),
  );
  assert.equal(summary.grossPurchases, 1);
  assert.equal(summary.netSales, 1);
  assert.equal(summary.grossRevenueMinor, 50_000);
  assert.equal(summary.netRevenueMinor, 50_000);
  assert.equal(summary.appreciationCount, 2);
  assert.equal(summary.appreciationGrossMinor, 20_000);
  assert.equal(summary.appreciationAuthorAccruedMinor, 14_000);

  const point = attachAppreciationToTimeseries(
    [emptyPoint("2026-09-04")],
    [sergey],
  )[0];
  assert.equal(point.grossPurchases, 1);
  assert.equal(point.netSales, 1);
  assert.equal(point.appreciationCount, 1);
  assert.equal(point.appreciationGrossMinor, 10_000);
}

function test5ProductSurfaceGoesToProductStats() {
  const products = attachAppreciationToProducts(
    [emptyProduct("prognoz-vysshee-ya-sentyabr-2026", "Прогноз")],
    [zoya],
  );
  assert.equal(products[0].appreciationCount, 1);
  assert.equal(products[0].appreciationGrossMinor, 10_000);
  assert.equal(products[0].appreciationAuthorAccruedMinor, 7_000);
  assert.equal(products[0].grossPurchases, 0);
  assert.equal(products[0].netSales, 0);
  assert.equal(isProductSurfaceFact(zoya), true);
}

function test6AuthorSurfaceNotAttachedToProduct() {
  const products = attachAppreciationToProducts(
    [emptyProduct("prognoz-vysshee-ya-sentyabr-2026", "Прогноз")],
    [sergey],
  );
  assert.equal(isAuthorSurfaceFact(sergey), true);
  assert.equal(isProductSurfaceFact(sergey), false);
  assert.equal(products[0].appreciationCount, 0);
  assert.equal(products[0].appreciationGrossMinor, 0);
  assert.equal(products[0].appreciationAuthorAccruedMinor, 0);

  const authorTotals = summarizeAppreciationStats([sergey]);
  assert.equal(authorTotals.appreciationCount, 1);
  assert.equal(authorTotals.appreciationGrossMinor, 10_000);
}

function test7AuthorCannotReadAnotherAuthor() {
  const leaked = filterAuthorAppreciationFactsForAuthor(
    [sergey, zoya],
    SERGEY_AUTHOR_ID,
  );
  assert.equal(leaked.length, 1);
  assert.equal(leaked[0].intentId, SERGEY_INTENT_ID);
  assert.equal(
    filterAuthorAppreciationFactsForAuthor([zoya], OTHER_AUTHOR_ID).length,
    0,
  );

  let queriedAuthor: string | null = null;
  const scoped = createAuthorFinanceAppreciationListHandler({
    requireAccess: async () => ({
      authorId: SERGEY_AUTHOR_ID,
      role: "owner",
      accessStatus: "commercial_active",
    }),
    getAppreciationList: async (input) => {
      queriedAuthor = input.authorId;
      const projected = projectAuthorAppreciationCabinet(
        filterAuthorAppreciationFactsForAuthor([sergey, zoya], input.authorId),
        NOW,
      );
      return {
        ...projected,
        total: projected.rows.length,
        limit: 100,
        offset: 0,
      };
    },
  });
  return scoped(
    new Request(
      `http://test/api/author/finance/appreciation?author_id=${ZOYA_AUTHOR_ID}`,
    ),
  ).then(async (response) => {
    const json = (await response.json()) as {
      rows: Array<{ id: string }>;
    };
    assert.equal(response.status, 200);
    assert.equal(queriedAuthor, SERGEY_AUTHOR_ID);
    assert.equal(json.rows.length, 1);
    assert.equal(json.rows[0].id, SERGEY_INTENT_ID);
  });
}

function test8FailedAbandonedNotEarnings() {
  const abandoned = paidFact({
    intentId: "pending-1",
    authorId: SERGEY_AUTHOR_ID,
    surface: "author",
    intentStatus: "pending",
    hasSaleAccrual: false,
    authorAccruedMinor: null,
    paidAt: null,
  });
  const failed = paidFact({
    intentId: "failed-1",
    authorId: SERGEY_AUTHOR_ID,
    surface: "author",
    intentStatus: "failed",
    hasSaleAccrual: false,
    authorAccruedMinor: null,
  });
  const review = paidFact({
    intentId: "review-1",
    authorId: SERGEY_AUTHOR_ID,
    surface: "author",
    intentStatus: "needs_review",
    hasSaleAccrual: false,
    authorAccruedMinor: null,
  });
  const processing = paidFact({
    intentId: "processing-1",
    authorId: SERGEY_AUTHOR_ID,
    surface: "author",
    hasSaleAccrual: false,
    authorAccruedMinor: null,
    availableAt: null,
  });

  assert.equal(isAuthorVisibleAppreciationIntent("pending"), false);
  assert.equal(isAuthorVisibleAppreciationIntent("failed"), false);
  assert.equal(isAuthorVisibleAppreciationIntent("needs_review"), false);
  assert.equal(isAuthorVisibleAppreciationIntent("paid"), true);

  const { rows, summary } = projectAuthorAppreciationCabinet(
    [abandoned, failed, review, processing, sergey],
    NOW,
  );
  assert.equal(rows.length, 2);
  assert.equal(summary.confirmedCount, 2);
  assert.equal(summary.authorAccruedMinor, 7_000);
  const processingRow = rows.find((row) => row.id === "processing-1");
  assert.ok(processingRow);
  assert.equal(processingRow.financeStatus, "processing");
  assert.equal(getAuthorAppreciationFinanceStatusLabel("processing"), "Обрабатывается");
  assert.equal(processingRow.authorAccruedMinor, null);
}

function test9CsvNoPiiOrProviderIds() {
  const { rows } = projectAuthorAppreciationCabinet([sergey, zoya], NOW);
  const csv = buildAuthorAppreciationCsv(rows);
  assertAppreciationCsvHasNoSensitiveText(csv);
  assert.match(csv, /Источник/);
  assert.match(csv, /Начислено вам/);
  assert.match(csv, /Страница автора/);
  assert.match(csv, /Прогноз от Высшего Я на сентябрь 2026/);
  assert.doesNotMatch(csv, /803348fb/);
  assert.doesNotMatch(csv, /email|phone|provider|getcourse|deal/i);
  assert.equal(isAuthorFinanceExportKind("appreciation"), true);
  assert.equal(isAuthorFinanceExportKind("sales"), true);

  const salesCsv = buildAuthorSalesCsv([
    {
      saleId: "sale-1",
      paidAt: "2026-09-01T00:00:00.000Z",
      productTitle: "Обычный продукт",
      buyerFirstName: "Анна",
      buyerLastName: "Иванова",
      amountMinor: 10_000,
      refundedAmountMinor: 0,
      netAmountMinor: 10_000,
      refundStatus: "none",
      currency: "RUB",
      authorAmountMinor: 7_000,
      accrualStatus: "accrued",
      payoutStatus: "held",
    },
  ]);
  assert.doesNotMatch(salesCsv, /Благодарность/);
  assert.doesNotMatch(csv, /Продажа/);
}

function test10Share70Author30Platform() {
  assert.equal(authorShareMinor(10_000, 7000), 7_000);
  assert.equal(platformShareMinor(10_000, 7000), 3_000);
  const { rows } = projectAuthorAppreciationCabinet([sergey, zoya], NOW);
  for (const row of rows) {
    assert.equal(row.grossAmountMinor, 10_000);
    assert.equal(row.authorAccruedMinor, 7_000);
  }
}

function testSergeyZoyaAdminAndAuthorVisibility() {
  const admin = projectAppreciationAnalytics([
    {
      intentId: SERGEY_INTENT_ID,
      authorId: SERGEY_AUTHOR_ID,
      authorName: "Сергей",
      surface: "author",
      productTitle: null,
      amountMinor: 10_000,
      status: "paid",
      paidAt: "2026-09-04T03:37:55.000Z",
      createdAt: "2026-09-04T03:20:00.000Z",
      authorAccruedMinor: 7_000,
      availableAt: "2026-09-18T03:37:55.000Z",
      providerDealIdPresent: true,
      providerDealNumberPresent: true,
      financeProjectionStatus: "projected",
      financeProjectionResultCode: "accrual_created",
      hasSaleAccrual: true,
    },
    {
      intentId: ZOYA_INTENT_ID,
      authorId: ZOYA_AUTHOR_ID,
      authorName: "Зоя",
      surface: "product",
      productTitle: "Прогноз от Высшего Я на сентябрь 2026",
      amountMinor: 10_000,
      status: "paid",
      paidAt: "2026-09-04T03:37:55.000Z",
      createdAt: "2026-09-04T03:20:00.000Z",
      authorAccruedMinor: 7_000,
      availableAt: "2026-09-18T03:37:55.000Z",
      providerDealIdPresent: true,
      providerDealNumberPresent: true,
      financeProjectionStatus: "projected",
      financeProjectionResultCode: "accrual_created",
      hasSaleAccrual: true,
    },
  ]);
  assert.equal(admin.summary.paidCount, 2);
  assert.equal(admin.summary.grossMinor, 20_000);
  assert.equal(admin.summary.authorAccruedMinor, 14_000);

  const authorSergey = projectAuthorAppreciationCabinet([sergey], NOW);
  const authorZoya = projectAuthorAppreciationCabinet([zoya], NOW);
  assert.equal(authorSergey.rows.length, 1);
  assert.equal(authorZoya.rows.length, 1);
  assert.equal(authorSergey.summary.grossAmountMinor, 10_000);
  assert.equal(authorSergey.summary.authorAccruedMinor, 7_000);
  assert.equal(authorZoya.summary.grossAmountMinor, 10_000);
  assert.equal(authorZoya.summary.authorAccruedMinor, 7_000);
}

function testCopyAndRoutes() {
  const financeUi = read(
    "src/components/author-dashboard/AuthorAppreciationSection.tsx",
  );
  const statsUi = read("src/components/author-dashboard/AuthorStatsClient.tsx");
  const labels = read("src/lib/author-finance/labels.ts");
  const cabinet = read("src/lib/author-finance/appreciation-cabinet.ts");
  const statsLabels = read("src/lib/author-stats/labels.ts");

  for (const source of [financeUi, statsUi, labels, cabinet, statsLabels]) {
    assert.doesNotMatch(source, /[Дд]онат/);
    assert.doesNotMatch(source, /[Пп]ожертвовани/);
  }
  assert.match(financeUi, /AUTHOR_APPRECIATION_SECTION_TITLE/);
  assert.match(financeUi, /AUTHOR_APPRECIATION_ROW_LABEL/);
  assert.match(financeUi, /AUTHOR_APPRECIATION_SUMMARY_LABELS/);
  assert.match(cabinet, /Благодарности от слушателей/);
  assert.match(cabinet, /Благодарность от слушателя/);
  assert.match(cabinet, /Обрабатывается/);
  assert.match(labels, /Начислено вам/);
  assert.match(labels, /Удерживается/);
  assert.match(labels, /Доступно к выплате/);
  assert.match(statsUi, /AUTHOR_STATS_APPRECIATION_SECTION_TITLE/);
  assert.equal(AUTHOR_APPRECIATION_SECTION_TITLE, "Благодарности от слушателей");
  assert.equal(AUTHOR_APPRECIATION_ROW_LABEL, "Благодарность от слушателя");

  const route = read("src/app/api/author/finance/appreciation/route.ts");
  assert.match(route, /createAuthorFinanceAppreciationListHandler/);
  const handler = read("src/lib/author-finance/route-handlers.ts");
  assert.match(handler, /requireAuthorFinanceAccess/);
  assert.match(handler, /kindParam === "appreciation"/);
  assert.match(handler, /buildAuthorAppreciationCsv/);
  assert.doesNotMatch(handler, /provider_deal/);

  const queries = read("src/lib/author-finance/appreciation-queries.ts");
  assert.match(queries, /\.eq\("author_id", input\.authorId\)/);
  assert.match(queries, /\.eq\("status", "paid"\)/);
  assert.doesNotMatch(queries, /provider_deal_id/);
  assert.doesNotMatch(queries, /email/);
  assert.doesNotMatch(queries, /phone/);

  const statsSummary = read("src/app/api/author/stats/summary/route.ts");
  assert.match(statsSummary, /attachAppreciationToSummary/);
  assert.match(statsSummary, /requireAuthorStatsAccess/);
}

async function testExportUsesVerifiedAuthorAndSeparateKind() {
  let exportAuthor: string | null = null;
  let salesCalled = false;
  const handler = createAuthorFinanceExportHandler({
    requireAccess: async () => ({
      authorId: SERGEY_AUTHOR_ID,
      role: "owner",
      accessStatus: "commercial_active",
    }),
    getSalesList: async () => {
      salesCalled = true;
      return { total: 0, limit: 0, offset: 0, rows: [] };
    },
    getAppreciationList: async (input) => {
      exportAuthor = input.authorId;
      const projected = projectAuthorAppreciationCabinet([sergey], NOW);
      return {
        ...projected,
        total: projected.rows.length,
        limit: 5000,
        offset: 0,
      };
    },
  });
  const response = await handler(
    new Request(
      `http://test/api/author/finance/export?kind=appreciation&author_id=${ZOYA_AUTHOR_ID}`,
    ),
  );
  const csv = await response.text();
  assert.equal(response.status, 200);
  assert.equal(exportAuthor, SERGEY_AUTHOR_ID);
  assert.equal(salesCalled, false);
  assert.match(csv, /благодарност/i);
  assertAppreciationCsvHasNoSensitiveText(csv);
}

async function main() {
  test1OrdinarySaleOnlyAsSale();
  test2AppreciationInAuthorList();
  test3SaleAccrualAffectsFinanceExactlyOnce();
  test4DoesNotInflateOrdinarySales();
  test5ProductSurfaceGoesToProductStats();
  test6AuthorSurfaceNotAttachedToProduct();
  await test7AuthorCannotReadAnotherAuthor();
  test8FailedAbandonedNotEarnings();
  test9CsvNoPiiOrProviderIds();
  test10Share70Author30Platform();
  testSergeyZoyaAdminAndAuthorVisibility();
  testCopyAndRoutes();
  await testExportUsesVerifiedAuthorAndSeparateKind();
  console.log("author-appreciation-cabinet-unit: ok");
}

await main();
