#!/usr/bin/env node
/**
 * Canonical author sales — pure unit tests (no DB, no network).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_SALES_CSV_COLUMNS,
  getAuthorSaleAccrualStatusLabel,
  getAuthorSalePayoutStatusLabel,
  getAuthorSaleStatusDisplay,
} from "../src/lib/author-sales/labels.ts";
import {
  AUTHOR_SALES_FORBIDDEN_FIELDS,
  formatBuyerDisplayName,
  isAuthorSaleAccrualStatus,
} from "../src/lib/author-sales/types.ts";
import {
  AuthorSalesExportError,
  assertNoForbiddenSalesExportFields,
  buildAuthorSalesCsv,
} from "../src/lib/author-sales/csv.ts";
import { selectAuthorFinanceEmptyState } from "../src/lib/author-finance/types.ts";
import {
  AUTHOR_PRODUCT_SOLD_EMAIL_SUBJECT,
  renderAuthorProductSoldEmailHtml,
  renderAuthorProductSoldEmailText,
} from "../src/lib/email/templates/author-product-sold.ts";
import { buildAuthorSaleMessageId } from "../src/lib/email/send-author-product-sold-email.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260730160000_author_canonical_sales.sql",
);

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}

function testLabels() {
  assertEqual(
    getAuthorSaleAccrualStatusLabel("accrued"),
    "Начислено",
    "accrued label",
  );
  assertEqual(
    getAuthorSaleAccrualStatusLabel("pending"),
    "Начисление обрабатывается",
    "pending label",
  );
  assertEqual(
    getAuthorSaleAccrualStatusLabel("requires_review"),
    "Требуется проверка",
    "review label",
  );
  assertEqual(
    getAuthorSaleAccrualStatusLabel("failed"),
    "Требуется проверка",
    "failed uses safe public wording",
  );
  assertEqual(
    getAuthorSaleAccrualStatusLabel("not_applicable"),
    "Без начисления",
    "historical not_applicable label",
  );
  assertEqual(
    getAuthorSaleAccrualStatusLabel("refunded"),
    "Возвращено",
    "accrual refunded label",
  );
  assertEqual(
    getAuthorSalePayoutStatusLabel("held"),
    "Сохраняется",
    "held label",
  );
  assertEqual(
    getAuthorSalePayoutStatusLabel("available"),
    "Доступно к выплате",
    "available label",
  );
  assertEqual(
    getAuthorSalePayoutStatusLabel("reserved"),
    "Зарезервировано",
    "reserved label",
  );
  assertEqual(
    getAuthorSalePayoutStatusLabel("paid"),
    "Выплачено",
    "paid label",
  );
  assertEqual(
    getAuthorSalePayoutStatusLabel("refunded"),
    "Возвращено",
    "payout refunded label",
  );
  assertEqual(
    getAuthorSalePayoutStatusLabel(null),
    "—",
    "null payout stays neutral",
  );
  assert(isAuthorSaleAccrualStatus("accrued"), "accrued is status");
}

function testIndependentStatusDisplay() {
  const pending = getAuthorSaleStatusDisplay({
    accrualStatus: "pending",
    payoutStatus: null,
  });
  assertEqual(pending.accrualLabel, "Начисление обрабатывается", "pending accrual");
  assertEqual(pending.payoutLabel, "—", "pending payout null");
  assertEqual(pending.refundLabel, null, "pending no refund chip");

  const held = getAuthorSaleStatusDisplay({
    accrualStatus: "accrued",
    payoutStatus: "held",
  });
  assertEqual(held.accrualLabel, "Начислено", "held accrual");
  assertEqual(held.payoutLabel, "Сохраняется", "held payout");

  const paid = getAuthorSaleStatusDisplay({
    accrualStatus: "accrued",
    payoutStatus: "paid",
  });
  assertEqual(paid.accrualLabel, "Начислено", "paid accrual");
  assertEqual(paid.payoutLabel, "Выплачено", "paid payout");

  const historical = getAuthorSaleStatusDisplay({
    accrualStatus: "not_applicable",
    payoutStatus: null,
  });
  assertEqual(historical.accrualLabel, "Без начисления", "historical accrual");
  assertEqual(historical.payoutLabel, "—", "historical payout null");
  assert(
    historical.payoutLabel !== historical.accrualLabel,
    "no accrual→payout fallback for historical sale",
  );

  const refund = getAuthorSaleStatusDisplay({
    accrualStatus: "refunded",
    payoutStatus: "refunded",
    refundStatus: "full",
  });
  assertEqual(refund.accrualLabel, "Возвращено", "refund accrual");
  assertEqual(refund.payoutLabel, "Возвращено", "refund payout");
  assertEqual(refund.refundLabel, "Возвращено", "full refund chip");

  const partial = getAuthorSaleStatusDisplay({
    accrualStatus: "accrued",
    payoutStatus: "held",
    refundStatus: "partial",
  });
  assertEqual(partial.refundLabel, "Частичный возврат", "partial refund chip");
  assertEqual(partial.accrualLabel, "Начислено", "partial keeps accrual");
  assertEqual(partial.payoutLabel, "Сохраняется", "partial keeps payout");

  const sectionSource = readFileSync(
    join(ROOT, "src/components/author-dashboard/AuthorSalesSection.tsx"),
    "utf8",
  );
  assert(
    !sectionSource.includes(
      "detail.payoutStatus\n                                ? getAuthorSalePayoutStatusLabel(\n                                    detail.payoutStatus,\n                                  )\n                                : getAuthorSaleAccrualStatusLabel",
    ),
    "detail must not fall back payout←accrual",
  );
  assert(
    sectionSource.includes("Статус начисления"),
    "detail shows accrual status label",
  );
  assert(
    sectionSource.includes("Статус выплаты"),
    "detail shows payout status label",
  );
  assert(
    sectionSource.includes("getAuthorSaleStatusDisplay"),
    "list uses independent status display helper",
  );
  assert(
    !sectionSource.includes(
      "row.payoutStatus\n                          ? getAuthorSalePayoutStatusLabel(row.payoutStatus)\n                          : getAuthorSaleAccrualStatusLabel(row.accrualStatus)",
    ),
    "list must not replace accrual with payout",
  );
}

function testBuyerName() {
  assertEqual(
    formatBuyerDisplayName("Анна", "Иванова"),
    "Анна Иванова",
    "full name",
  );
  assertEqual(formatBuyerDisplayName("Анна", null), "Анна", "first only");
  assertEqual(formatBuyerDisplayName(null, null), "Покупатель", "fallback");
}

function testEmptyStateWithSalesWithoutLedger() {
  const code = selectAuthorFinanceEmptyState({
    payoutEligible: true,
    accessStatus: "commercial_active",
    approvedTermsCount: 1,
    entryCount: 0,
    saleCount: 3,
    payableMinor: 0,
    reservedMinor: 0,
    heldMinor: 0,
    paidPayoutCount: 0,
    authorTermsAccepted: true,
  });
  assertEqual(code, "active_ok", "sales without ledger must not be no_sales");

  const noSales = selectAuthorFinanceEmptyState({
    payoutEligible: true,
    accessStatus: "commercial_active",
    approvedTermsCount: 1,
    entryCount: 0,
    saleCount: 0,
    payableMinor: 0,
    reservedMinor: 0,
    heldMinor: 0,
    paidPayoutCount: 0,
    authorTermsAccepted: true,
  });
  assertEqual(noSales, "no_sales", "zero sales stays no_sales");
}

function testCsvNoPii() {
  assertNoForbiddenSalesExportFields(AUTHOR_SALES_CSV_COLUMNS);
  const csv = buildAuthorSalesCsv([
    {
      saleId: "11111111-1111-1111-1111-111111111111",
      paidAt: "2026-07-20T11:37:44.726Z",
      practiceId: "22222222-2222-2222-2222-222222222222",
      productTitle: "Активация канала изобилия",
      buyerFirstName: "Анна",
      buyerLastName: "Иванова",
      amountMinor: 29900,
      refundedAmountMinor: 0,
      netAmountMinor: 29900,
      refundStatus: "none",
      currency: "RUB",
      authorAmountMinor: null,
      accrualStatus: "requires_review",
      payoutStatus: null,
      attributionSource: "historical_fallback",
      isHistoricalException: false,
    },
  ]);
  assert(csv.includes("Анна"), "buyer first name present");
  assert(csv.includes("Иванова"), "buyer last name present");
  assert(!/email/i.test(csv), "email header absent");
  assert(!/@/.test(csv), "no email addresses");
  assert(!csv.includes("payment_id"), "payment_id absent");
  assert(!csv.includes("order_id"), "order_id field name absent");

  let thrown = false;
  try {
    assertNoForbiddenSalesExportFields(["email"]);
  } catch (error) {
    thrown = error instanceof AuthorSalesExportError;
  }
  assert(thrown, "forbidden email header rejected");
}

function testEmailNoPii() {
  const html = renderAuthorProductSoldEmailHtml({
    productTitle: "Активация канала изобилия",
    buyerFirstName: "Анна",
    buyerLastName: "Иванова",
    paidAt: "2026-07-20T11:37:44.726Z",
    amountMinor: 29900,
    authorAmountMinor: null,
    authorAmountPending: true,
  });
  const text = renderAuthorProductSoldEmailText({
    productTitle: "Активация канала изобилия",
    buyerFirstName: "Анна",
    buyerLastName: "Иванова",
    paidAt: "2026-07-20T11:37:44.726Z",
    amountMinor: 29900,
    authorAmountPending: true,
  });
  assertEqual(
    AUTHOR_PRODUCT_SOLD_EMAIL_SUBJECT,
    "Ваш продукт купили на АудиоЛаде",
    "subject",
  );
  assert(html.includes("Анна Иванова"), "buyer name in html");
  assert(text.includes("Анна Иванова"), "buyer name in text");
  assert(!/Анна[^<]*@/.test(html), "no buyer email adjacent to name in html");
  assert(!text.toLowerCase().includes("@gmail"), "no buyer gmail in text");
  assert(!html.includes("buyer_email"), "no buyer_email field");
  assert(!html.includes("contact_email"), "no contact_email field");
  assert(!html.includes("payment_id"), "no payment id in html");
  assert(!text.includes("payment_id"), "no payment id in text");
  assert(!html.includes("owner_historical_sale"), "no historical exception code");
  assert(!text.includes("requires_review"), "no technical review code");
  assert(
    text.includes("Сумма начисления появится"),
    "pending accrual wording",
  );
  assertEqual(
    `author_product_sold:${"sale-1"}`,
    "author_product_sold:sale-1",
    "dedup key format",
  );
  assertEqual(
    buildAuthorSaleMessageId("sale-1"),
    "<author-sale-sale-1@audiolad.ru>",
    "stable retry Message-ID",
  );
}

function testMigrationContracts() {
  const sql = readFileSync(MIGRATION, "utf8");
  assert(sql.includes("author_canonical_sales_base"), "base projection");
  assert(sql.includes("author_canonical_sales_list"), "list rpc");
  assert(sql.includes("author_canonical_sales_detail"), "detail rpc");
  assert(sql.includes("order_sale_accrual_ready"), "checkout gate");
  assert(sql.includes("orders_enforce_author_id_snapshot"), "snapshot trigger");
  assert(sql.includes("access_source = 'purchase'"), "purchase access required");
  assert(
    sql.includes("author_historical_sale_exceptions"),
    "restricted historical exception allowlist",
  );
  assert(
    !sql.includes("WHEN p_practice_author_id IS NOT NULL THEN p_practice_author_id"),
    "no mutable practice author fallback",
  );
  assert(
    sql.includes("author_canonical_sales_counts"),
    "counts for stats SoT",
  );
  assert(
    !sql.includes("UPDATE public.orders SET author_id_snapshot"),
    "no silent production backfill",
  );
  const listFn = sql.slice(
    sql.indexOf("author_canonical_sales_list"),
    sql.indexOf("author_canonical_sales_detail"),
  );
  assert(!listFn.includes("'email'"), "list rpc has no email key");
  assert(!listFn.includes("'payment_id'"), "list rpc has no payment_id key");
  assert(!listFn.includes("'user_id'"), "list rpc has no user_id key");
  assert(!listFn.includes("'practice_id'"), "list rpc has no practice_id key");
  assert(sql.includes("'product_slug'"), "public product slug filter");
  assert(sql.includes("'gross_purchases'"), "explicit gross purchase metric");
  assert(sql.includes("'refund_sales'"), "explicit refund sales metric");
  assert(!sql.includes("'refund_count'"), "no ambiguous refund count metric");
  assert(sql.includes("author_sale_email_outbox"), "durable author sale outbox");
  void AUTHOR_SALES_FORBIDDEN_FIELDS;
}

function main() {
  testLabels();
  testIndependentStatusDisplay();
  testBuyerName();
  testEmptyStateWithSalesWithoutLedger();
  testCsvNoPii();
  testEmailNoPii();
  testMigrationContracts();
  console.log("author-canonical-sales-unit: ok");
}

main();
