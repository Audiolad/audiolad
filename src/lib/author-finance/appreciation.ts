import type { AuthorFinanceLedgerRow } from "./types";

export function overlayAppreciationFinanceRow(
  row: AuthorFinanceLedgerRow,
  isAppreciation: boolean,
): AuthorFinanceLedgerRow {
  if (!isAppreciation) return row;
  return {
    ...row,
    typeKey: "appreciation",
  };
}

export function overlayAppreciationFinanceRows(
  rows: AuthorFinanceLedgerRow[],
  appreciationEntryIds: ReadonlySet<string>,
): AuthorFinanceLedgerRow[] {
  return rows.map((row) =>
    overlayAppreciationFinanceRow(row, appreciationEntryIds.has(row.entryId)),
  );
}
