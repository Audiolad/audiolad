export type PartnerRewardBalance = {
  currency: string;
  accruedMinor: number;
  heldMinor: number;
  availableMinor: number;
  paidMinor: number;
  invariantOk: boolean;
};

export type PartnerRewardHistoryRow = {
  name: string;
  type: "reward_accrual" | "reward_reversal";
  amountMinor: number;
  currency: string;
  effectiveAt: string;
  availabilityState: "held" | "available";
};

export type PartnerRewardDashboard = {
  balances: PartnerRewardBalance[];
  history: PartnerRewardHistoryRow[];
};

function asMinor(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function isCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function hasOnlyKeys(
  row: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(row).every((key) => allowedKeys.includes(key));
}

function parseBalance(value: unknown): PartnerRewardBalance | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const accruedMinor = asMinor(row.accrued_minor);
  const heldMinor = asMinor(row.held_minor);
  const availableMinor = asMinor(row.available_minor);
  const paidMinor = asMinor(row.paid_minor);

  if (
    !hasOnlyKeys(row, [
      "currency",
      "accrued_minor",
      "held_minor",
      "available_minor",
      "paid_minor",
      "invariant_ok",
    ]) ||
    !isCurrency(row.currency) ||
    accruedMinor === null ||
    heldMinor === null ||
    availableMinor === null ||
    paidMinor === null ||
    typeof row.invariant_ok !== "boolean"
  ) {
    return null;
  }

  return {
    currency: row.currency,
    accruedMinor,
    heldMinor,
    availableMinor,
    paidMinor,
    invariantOk: row.invariant_ok,
  };
}

function parseHistoryRow(value: unknown): PartnerRewardHistoryRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const amountMinor = asMinor(row.amount_minor);

  if (
    !hasOnlyKeys(row, [
      "name",
      "type",
      "amount_minor",
      "currency",
      "effective_at",
      "availability_state",
    ]) ||
    typeof row.name !== "string" ||
    (row.type !== "reward_accrual" && row.type !== "reward_reversal") ||
    amountMinor === null ||
    !isCurrency(row.currency) ||
    !isTimestamp(row.effective_at) ||
    (row.availability_state !== "held" && row.availability_state !== "available")
  ) {
    return null;
  }

  return {
    name: row.name,
    type: row.type,
    amountMinor,
    currency: row.currency,
    effectiveAt: row.effective_at,
    availabilityState: row.availability_state,
  };
}

export function parsePartnerRewardDashboardPayload(
  payload: unknown,
): PartnerRewardDashboard | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (!Array.isArray(row.balances) || !Array.isArray(row.history)) return null;

  const balances = row.balances.map(parseBalance);
  const history = row.history.map(parseHistoryRow);
  if (balances.some((value) => value === null) || history.some((value) => value === null)) {
    return null;
  }

  return {
    balances: balances as PartnerRewardBalance[],
    history: history as PartnerRewardHistoryRow[],
  };
}

export const PARTNER_REWARD_LOAD_ERROR =
  "Не удалось загрузить данные о начислениях. Обновите страницу.";
