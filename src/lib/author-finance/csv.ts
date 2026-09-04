/**
 * P3.3.4 CSV export.
 *
 * The export is built from the same author-safe rows the UI renders, never
 * from a table. On top of that the builders refuse to emit a column whose name
 * matches the forbidden set: if a future change widens the row type, the export
 * throws instead of quietly shipping an internal field to an author's laptop.
 */

import { buildCsv } from "@/lib/admin/analytics-csv";

import {
  AUTHOR_APPRECIATION_FORBIDDEN_FIELDS,
  getAuthorAppreciationFinanceStatusLabel,
  type AuthorAppreciationFinanceRow,
} from "./appreciation-cabinet";
import {
  getAuthorFinancePayoutStatusLabel,
  getAuthorFinanceTypeLabel,
  getAuthorFinanceAmountStateLabel,
  AUTHOR_FINANCE_CSV_COLUMNS,
} from "./labels";
import {
  AUTHOR_FINANCE_FORBIDDEN_FIELDS,
  type AuthorFinanceLedgerRow,
  type AuthorFinancePayoutRow,
} from "./types";

export class AuthorFinanceExportError extends Error {}

/** Case- and separator-insensitive: `Payment ID` must not slip past `payment_id`. */
function normalizeFieldName(value: string): string {
  return value.toLowerCase().replace(/[\s\-.]+/g, "_");
}

export function assertNoForbiddenExportFields(fields: readonly string[]): void {
  const forbidden = new Set<string>(AUTHOR_FINANCE_FORBIDDEN_FIELDS);

  for (const field of fields) {
    if (forbidden.has(normalizeFieldName(field))) {
      throw new AuthorFinanceExportError(
        `author_finance_export_forbidden_field:${field}`,
      );
    }
  }
}

/** Kopeks to a plain decimal for spreadsheets: no currency sign, no grouping. */
export function formatMinorForCsv(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(amountMinor));
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function formatDateForCsv(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function buildAuthorFinanceLedgerCsv(
  rows: readonly AuthorFinanceLedgerRow[],
): string {
  // The machine field names behind each human column, checked before export.
  assertNoForbiddenExportFields([
    "effective_at",
    "type_key",
    "product_title",
    "amount_minor",
    "currency",
    "amount_state",
    "available_at",
    "payout_safe_ref",
  ]);

  return buildCsv(
    [...AUTHOR_FINANCE_CSV_COLUMNS.ledger],
    rows.map((row) => [
      formatDateForCsv(row.effectiveAt),
      getAuthorFinanceTypeLabel(row.typeKey),
      row.productTitle ?? "",
      formatMinorForCsv(row.amountMinor),
      row.currency,
      getAuthorFinanceAmountStateLabel(row.amountState),
      formatDateForCsv(row.availableAt),
      row.payoutSafeRef ?? "",
    ]),
  );
}

export function buildAuthorFinancePayoutsCsv(
  rows: readonly AuthorFinancePayoutRow[],
): string {
  // reference_masked is the masked value, never external_reference itself.
  assertNoForbiddenExportFields([
    "created_at",
    "period_label",
    "amount_minor",
    "currency",
    "status_key",
    "paid_at",
    "reference_masked",
  ]);

  return buildCsv(
    [...AUTHOR_FINANCE_CSV_COLUMNS.payouts],
    rows.map((row) => [
      formatDateForCsv(row.createdAt),
      row.periodLabel,
      formatMinorForCsv(row.amountMinor),
      row.currency,
      getAuthorFinancePayoutStatusLabel(row.statusKey),
      formatDateForCsv(row.paidAt),
      row.referenceMasked ?? "",
    ]),
  );
}

export function assertAppreciationCsvHasNoSensitiveText(csv: string): void {
  const normalized = csv.toLowerCase();
  for (const field of AUTHOR_APPRECIATION_FORBIDDEN_FIELDS) {
    if (normalized.includes(field)) {
      throw new AuthorFinanceExportError(
        `author_appreciation_export_forbidden_text:${field}`,
      );
    }
  }
}

export function buildAuthorAppreciationCsv(
  rows: readonly AuthorAppreciationFinanceRow[],
): string {
  assertNoForbiddenExportFields([
    "paid_at",
    "source_title",
    "gross_amount_minor",
    "author_accrued_minor",
    "finance_status",
    "available_at",
  ]);

  const csv = buildCsv(
    [...AUTHOR_FINANCE_CSV_COLUMNS.appreciation],
    rows.map((row) => [
      formatDateForCsv(row.paidAt ?? row.createdAt),
      row.sourceTitle,
      formatMinorForCsv(row.grossAmountMinor),
      row.authorAccruedMinor === null ? "" : formatMinorForCsv(row.authorAccruedMinor),
      getAuthorAppreciationFinanceStatusLabel(row.financeStatus),
      formatDateForCsv(row.availableAt),
    ]),
  );
  assertAppreciationCsvHasNoSensitiveText(csv);
  return csv;
}

export const AUTHOR_FINANCE_EXPORT_KINDS = [
  "ledger",
  "payouts",
  "sales",
  "appreciation",
] as const;

export type AuthorFinanceExportKind =
  (typeof AUTHOR_FINANCE_EXPORT_KINDS)[number];

export function isAuthorFinanceExportKind(
  value: unknown,
): value is AuthorFinanceExportKind {
  return (
    typeof value === "string" &&
    (AUTHOR_FINANCE_EXPORT_KINDS as readonly string[]).includes(value)
  );
}

export function buildAuthorFinanceExportFilename(
  kind: AuthorFinanceExportKind,
  now: Date = new Date(),
): string {
  const stamp = now.toISOString().slice(0, 10);
  return `audiolad-finance-${kind}-${stamp}.csv`;
}
