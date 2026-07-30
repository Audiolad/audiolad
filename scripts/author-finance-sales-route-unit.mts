import assert from "node:assert/strict";

import { createAuthorFinanceExportHandler } from "@/app/api/author/finance/export/route";
import { createAuthorFinanceSalesDetailHandler } from "@/app/api/author/finance/sales/[id]/route";
import { createAuthorFinanceSalesListHandler } from "@/app/api/author/finance/sales/route";
import { AuthorAccessError } from "@/lib/author-products/auth";

const AUTHOR_A = "b0000000-0000-0000-0000-000000000001";
const SALE_A = "d0000000-0000-0000-0000-000000000001";
const SALE_B = "d0000000-0000-0000-0000-000000000003";

const safeSale = {
  saleId: SALE_A,
  paidAt: "2026-07-01T00:00:00.000Z",
  productTitle: "=Безопасный продукт",
  buyerFirstName: "=Анна",
  buyerLastName: "Иванова",
  amountMinor: 10000,
  refundedAmountMinor: 0,
  netAmountMinor: 10000,
  refundStatus: "none" as const,
  currency: "RUB",
  authorAmountMinor: 7000,
  accrualStatus: "accrued",
  payoutStatus: null,
};

const emptyProducts: Array<{ productSlug: string; productTitle: string }> = [];
const emptyCounts = {
  grossPurchases: 0,
  refundSales: 0,
  partialRefunds: 0,
  fullRefunds: 0,
  netSales: 0,
  grossRevenueMinor: 0,
  refundedAmountMinor: 0,
  netRevenueMinor: 0,
  accrued: 0,
  pendingAccrual: 0,
};

function authorized() {
  return async () => ({ authorId: AUTHOR_A, role: "owner" });
}

async function main() {
  const unauthenticated = createAuthorFinanceSalesListHandler({
    requireAccess: async () => {
      throw new AuthorAccessError("unauthorized", 401);
    },
    getSalesList: async () => ({ total: 0, limit: 50, offset: 0, rows: [] }),
    getProductOptions: async () => emptyProducts,
  } as never);
  assert.equal(
    (await unauthenticated(new Request("http://test/api/author/finance/sales"))).status,
    401,
  );

  let listInput: Record<string, unknown> | null = null;
  const list = createAuthorFinanceSalesListHandler({
    requireAccess: authorized(),
    getSalesList: async (input: Record<string, unknown>) => {
      listInput = input;
      return { total: 1, limit: 50, offset: 0, rows: [safeSale] };
    },
    getProductOptions: async () => [
      { productSlug: "safe-product", productTitle: "Безопасный продукт" },
    ],
  } as never);
  const listResponse = await list(
    new Request(`http://test/api/author/finance/sales?author_id=attacker&product_slug=safe-product`),
  );
  const listJson = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal((listInput as Record<string, unknown> | null)?.authorId, AUTHOR_A, "verified membership scopes the query");
  assert.equal((listInput as Record<string, unknown> | null)?.productSlug, "safe-product");
  assert.equal(JSON.stringify(listJson).includes("practice_id"), false);
  assert.equal(JSON.stringify(listJson).includes("payment_id"), false);
  assert.equal(JSON.stringify(listJson).includes("email"), false);

  const detail = createAuthorFinanceSalesDetailHandler({
    requireAccess: authorized(),
    getSaleDetail: async ({ saleId }: { saleId: string }) =>
      saleId === SALE_A ? safeSale : null,
  } as never);
  assert.equal(
    (await detail(new Request("http://test"), { params: Promise.resolve({ id: SALE_B }) })).status,
    404,
    "foreign/team sale remains not found after author scoping",
  );

  let exportInput: Record<string, unknown> | null = null;
  const exportHandler = createAuthorFinanceExportHandler({
    requireAccess: authorized(),
    getSalesList: async (input: Record<string, unknown>) => {
      exportInput = input;
      return { total: 1, limit: 1, offset: 0, rows: [safeSale] };
    },
  } as never);
  const csvResponse = await exportHandler(
    new Request("http://test/api/author/finance/export?kind=sales&author_id=attacker&product_slug=safe-product"),
  );
  const csv = await csvResponse.text();
  assert.equal(csvResponse.status, 200);
  assert.equal((exportInput as Record<string, unknown> | null)?.authorId, AUTHOR_A);
  assert.match(csv, /'=Анна/, "CSV formula-like buyer names are escaped");
  assert.equal(csv.includes("practice_id"), false);
  assert.equal(csv.includes("payment_id"), false);
  assert.equal(csv.includes("email"), false);

  void emptyCounts;
  console.log("author-finance-sales-route-unit: ok");
}

await main();
