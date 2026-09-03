#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADMIN_APPRECIATION_OPERATION_LABEL,
  projectAppreciationAnalytics,
  type AppreciationIntentFact,
} from "../src/lib/admin/appreciation-analytics";
import { overlayAppreciationFinanceRows } from "../src/lib/author-finance/appreciation";
import { AUTHOR_APPRECIATION_FINANCE_LABEL, getAuthorFinanceTypeLabel } from "../src/lib/author-finance/labels";
import type { AuthorFinanceLedgerRow } from "../src/lib/author-finance/types";
import { authorShareMinor, platformShareMinor } from "../src/lib/payments/author-finance/types";

const paid: AppreciationIntentFact = {
  intentId: "intent-zoya",
  authorId: "author-zoya",
  authorName: "Автор",
  surface: "product",
  productTitle: "Свободная практика",
  amountMinor: 10_000,
  status: "paid",
  paidAt: "2026-09-03T13:20:00.000Z",
  createdAt: "2026-09-03T13:15:00.000Z",
  authorAccruedMinor: 7_000,
  availableAt: "2026-09-17T13:20:00.000Z",
  providerDealIdPresent: true,
  providerDealNumberPresent: true,
  financeProjectionStatus: "projected",
  financeProjectionResultCode: "accrual_created",
  hasSaleAccrual: true,
};

const pending: AppreciationIntentFact = {
  intentId: "intent-sergey",
  authorId: "author-sergey",
  authorName: "Автор",
  surface: "author",
  productTitle: null,
  amountMinor: 10_000,
  status: "pending",
  paidAt: null,
  createdAt: "2026-09-03T08:40:00.000Z",
  authorAccruedMinor: null,
  availableAt: null,
  providerDealIdPresent: true,
  providerDealNumberPresent: false,
  financeProjectionStatus: "pending",
  financeProjectionResultCode: null,
  hasSaleAccrual: false,
};

{
  const projection = projectAppreciationAnalytics([paid, pending]);
  assert.equal(projection.source, "author_appreciation_payment_intents+author_ledger_entries");
  assert.equal(projection.operationLabel, ADMIN_APPRECIATION_OPERATION_LABEL);
  assert.equal(projection.summary.count, 2);
  assert.equal(projection.summary.paidCount, 1);
  assert.equal(projection.summary.pendingCount, 1);
  assert.equal(projection.summary.grossMinor, 10_000);
  assert.equal(projection.summary.authorAccruedMinor, 7_000);
  assert.equal(projection.summary.platformShareMinor, 3_000);
  assert.equal(authorShareMinor(10_000, 7000), 7_000);
  assert.equal(platformShareMinor(10_000, 7000), 3_000);
}

{
  const salesPage = readFileSync("src/app/(platform)/admin/sales/page.tsx", "utf8");
  assert.match(salesPage, /AdminAppreciationBlock/);
  assert.match(salesPage, /getAdminAppreciationAnalytics/);
  assert.doesNotMatch(salesPage, /from\("orders"\)/);
  const queries = readFileSync("src/lib/admin/appreciation-analytics-queries.ts", "utf8");
  assert.match(queries, /author_appreciation_payment_intents/);
  assert.match(queries, /author_ledger_entries/);
  assert.match(queries, /provider_deal_id/);
  assert.match(queries, /finance_projection_status/);
  assert.doesNotMatch(queries, /from\("orders"\)/);
  assert.doesNotMatch(queries, /from\("payments"\)/);
  const salesQueries = readFileSync("src/lib/admin/sales-queries.ts", "utf8");
  assert.match(salesQueries, /from\("payments"\)/);
}

{
  const saleRow: AuthorFinanceLedgerRow = {
    entryId: "sale-1",
    typeKey: "sale",
    amountMinor: 7_000,
    currency: "RUB",
    effectiveAt: "2026-09-03T13:20:00.000Z",
    availableAt: "2026-09-17T13:20:00.000Z",
    isHeld: true,
    amountState: "held",
    productTitle: "Свободная практика",
    payoutSafeRef: null,
    publicComment: null,
  };
  const overlaid = overlayAppreciationFinanceRows([saleRow], new Set(["sale-1"]));
  assert.equal(overlaid[0].typeKey, "appreciation");
  assert.equal(getAuthorFinanceTypeLabel("appreciation"), AUTHOR_APPRECIATION_FINANCE_LABEL);
  assert.notEqual(getAuthorFinanceTypeLabel("appreciation"), getAuthorFinanceTypeLabel("sale"));
}

{
  const checkout = readFileSync("src/app/api/author-appreciation/checkout/route.ts", "utf8");
  assert.doesNotMatch(checkout, /from\("(?:orders|payments)"\)/);
  const ensure = readFileSync(
    "supabase/migrations/20260918120000_author_appreciation_finance_projection_status.sql",
    "utf8",
  );
  assert.match(ensure, /payment_id,\s*\n\s*order_id,/);
  assert.match(ensure, /NULL,\s*\n\s*NULL,\s*\n\s*v_intent.practice_id/);
}

console.log("author-appreciation-admin-analytics-unit: ok");
