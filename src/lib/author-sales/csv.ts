import { escapeCsvCell } from "../admin/analytics-csv";
import { formatMinorForCsv } from "../author-finance/csv";

import {
  AUTHOR_SALES_CSV_COLUMNS,
  getAuthorSaleAccrualStatusLabel,
  getAuthorSalePayoutStatusLabel,
  getAuthorSaleRefundStatusLabel,
} from "./labels";
import {
  AUTHOR_SALES_FORBIDDEN_FIELDS,
  type AuthorSaleRow,
} from "./types";

export class AuthorSalesExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorSalesExportError";
  }
}

function normalizeFieldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FORBIDDEN_NORMALIZED = new Set(
  AUTHOR_SALES_FORBIDDEN_FIELDS.map((field) => normalizeFieldKey(field)),
);

export function assertNoForbiddenSalesExportFields(
  headers: readonly string[],
  sampleRow?: Record<string, unknown>,
): void {
  for (const header of headers) {
    if (FORBIDDEN_NORMALIZED.has(normalizeFieldKey(header))) {
      throw new AuthorSalesExportError(`forbidden_export_field:${header}`);
    }
  }

  if (sampleRow) {
    for (const key of Object.keys(sampleRow)) {
      if (FORBIDDEN_NORMALIZED.has(normalizeFieldKey(key))) {
        throw new AuthorSalesExportError(`forbidden_export_field:${key}`);
      }
    }
  }
}

function splitPaidAt(paidAt: string | null): { date: string; time: string } {
  if (!paidAt) return { date: "", time: "" };
  const parsed = new Date(paidAt);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  return {
    date: parsed.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Moscow",
    }),
    time: parsed.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Europe/Moscow",
    }),
  };
}

function escapeSpreadsheetFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function buildAuthorSalesCsv(rows: AuthorSaleRow[]): string {
  assertNoForbiddenSalesExportFields(AUTHOR_SALES_CSV_COLUMNS);

  const lines = [AUTHOR_SALES_CSV_COLUMNS.map(escapeCsvCell).join(",")];

  for (const row of rows) {
    const { date, time } = splitPaidAt(row.paidAt);
    const cells = [
      date,
      time,
      escapeSpreadsheetFormula(row.productTitle),
      escapeSpreadsheetFormula(row.buyerFirstName ?? ""),
      escapeSpreadsheetFormula(row.buyerLastName ?? ""),
      formatMinorForCsv(row.amountMinor),
      formatMinorForCsv(row.refundedAmountMinor),
      formatMinorForCsv(row.netAmountMinor),
      getAuthorSaleRefundStatusLabel(row.refundStatus),
      row.authorAmountMinor === null
        ? ""
        : formatMinorForCsv(row.authorAmountMinor),
      getAuthorSaleAccrualStatusLabel(row.accrualStatus),
      getAuthorSalePayoutStatusLabel(row.payoutStatus),
      row.saleId,
    ];

    const asRecord = Object.fromEntries(
      AUTHOR_SALES_CSV_COLUMNS.map((header, index) => [header, cells[index]]),
    );
    assertNoForbiddenSalesExportFields(AUTHOR_SALES_CSV_COLUMNS, asRecord);
    lines.push(cells.map(escapeCsvCell).join(","));
  }

  return `\uFEFF${lines.join("\n")}\n`;
}

export function buildAuthorSalesExportFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `audiolad-finance-sales-${stamp}.csv`;
}
