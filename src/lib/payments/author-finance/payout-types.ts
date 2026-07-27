/**
 * P3.3.3 author payout vocabulary and money math.
 *
 * Same contract as the P3.3.2 types module: SQL owns every written number,
 * this file mirrors the arithmetic so the admin UI can preview an amount and
 * so the rules can be unit-tested without a database. Money is integer kopeks.
 */

export const P333_CALCULATION_VERSION = "p333.v1";

/** 1000 ₽. Mirrors public.author_payout_minimum_minor(). */
export const AUTHOR_PAYOUT_MINIMUM_MINOR = 100000;

export const AUTHOR_PAYOUT_CADENCE = "monthly" as const;
export const AUTHOR_PAYOUT_TIMEZONE = "Europe/Moscow" as const;

export const AUTHOR_PAYOUT_STATUSES = [
  "draft",
  "approved",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "requires_review",
  "reversed",
] as const;

export type AuthorPayoutStatus = (typeof AUTHOR_PAYOUT_STATUSES)[number];

/** Statuses whose reserved allocations still hold money back. */
export const AUTHOR_PAYOUT_ACTIVE_STATUSES = [
  "draft",
  "approved",
  "processing",
  "requires_review",
] as const;

export const AUTHOR_PAYOUT_ALLOCATION_STATUSES = [
  "reserved",
  "paid",
  "released",
  "requires_review",
] as const;

export type AuthorPayoutAllocationStatus =
  (typeof AUTHOR_PAYOUT_ALLOCATION_STATUSES)[number];

/** Allocations that still consume their source entry. Mirrors the SQL helper. */
export const AUTHOR_PAYOUT_ALLOCATION_CONSUMING_STATUSES = [
  "reserved",
  "paid",
  "requires_review",
] as const;

/** Mirrors public.author_payout_transition_allowed. */
const AUTHOR_PAYOUT_TRANSITIONS: Record<
  AuthorPayoutStatus,
  readonly AuthorPayoutStatus[]
> = {
  draft: ["approved", "cancelled", "requires_review", "failed"],
  approved: ["processing", "paid", "cancelled", "requires_review", "failed"],
  processing: ["paid", "failed", "requires_review"],
  requires_review: ["approved", "processing", "cancelled", "failed"],
  paid: ["reversed"],
  failed: [],
  cancelled: [],
  reversed: [],
};

export function isAuthorPayoutStatus(
  value: unknown,
): value is AuthorPayoutStatus {
  return (
    typeof value === "string" &&
    (AUTHOR_PAYOUT_STATUSES as readonly string[]).includes(value)
  );
}

export function isAuthorPayoutAllocationStatus(
  value: unknown,
): value is AuthorPayoutAllocationStatus {
  return (
    typeof value === "string" &&
    (AUTHOR_PAYOUT_ALLOCATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isAuthorPayoutActiveStatus(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (AUTHOR_PAYOUT_ACTIVE_STATUSES as readonly string[]).includes(value)
  );
}

export function isAuthorPayoutTransitionAllowed(
  from: string,
  to: string,
): boolean {
  if (!isAuthorPayoutStatus(from) || !isAuthorPayoutStatus(to)) return false;
  // Re-entering the same status is a replay, which the RPCs answer
  // idempotently rather than rejecting.
  if (from === to) return true;
  return (AUTHOR_PAYOUT_TRANSITIONS[from] as readonly string[]).includes(to);
}

/** A payout is closed once no further money movement can follow. */
export function isAuthorPayoutTerminal(status: AuthorPayoutStatus): boolean {
  return AUTHOR_PAYOUT_TRANSITIONS[status].length === 0;
}

export type AuthorPayoutSourceEntry = {
  entryId: string;
  amountMinor: number;
  /** Already claimed by reserved/paid allocations of other payouts. */
  allocatedMinor?: number;
  /** Null means never held. */
  availableAt?: string | null;
  effectiveAt: string;
};

export type AuthorPayoutCapacity = {
  positiveAvailableMinor: number;
  negativeAvailableMinor: number;
  availableBalanceMinor: number;
  heldMinor: number;
  allocatablePositiveMinor: number;
  activeReservedMinor: number;
  rawCapacityMinor: number;
  capacityMinor: number;
  capacityCappedBySources: boolean;
};

function toCutoff(cutoff: Date | string): number {
  return cutoff instanceof Date ? cutoff.getTime() : new Date(cutoff).getTime();
}

function isAvailableAt(entry: AuthorPayoutSourceEntry, cutoff: number): boolean {
  if (!entry.availableAt) return true;
  const at = new Date(entry.availableAt).getTime();
  if (Number.isNaN(at)) return true;
  return at <= cutoff;
}

/**
 * Mirrors public.author_payout_payable_snapshot.
 *
 * Negative rows (refund reversals, manual debits, prior payouts) are a single
 * global holdback rather than a netting against one arbitrary source row: that
 * keeps FIFO honest and keeps the explanation readable in a dispute. The
 * capacity is additionally capped by the still-unclaimed positive rows, so a
 * bookkeeping drift can only ever make us pay less, never more.
 */
export function computePayoutCapacity(input: {
  entries: readonly AuthorPayoutSourceEntry[];
  activeReservedMinor?: number;
  cutoff?: Date | string;
}): AuthorPayoutCapacity {
  const cutoff = toCutoff(input.cutoff ?? new Date());
  const reserved = Math.max(0, Math.trunc(input.activeReservedMinor ?? 0));

  let positive = 0;
  let negative = 0;
  let held = 0;
  let allocatable = 0;

  for (const entry of input.entries) {
    const amount = Math.trunc(entry.amountMinor);

    if (!isAvailableAt(entry, cutoff)) {
      held += amount;
      continue;
    }

    if (amount > 0) {
      positive += amount;
      const claimed = Math.max(0, Math.trunc(entry.allocatedMinor ?? 0));
      allocatable += Math.max(0, amount - claimed);
    } else {
      negative += -amount;
    }
  }

  const available = positive - negative;
  const raw = available - reserved;
  const capacity = Math.max(0, Math.min(raw, allocatable));

  return {
    positiveAvailableMinor: positive,
    negativeAvailableMinor: negative,
    availableBalanceMinor: available,
    heldMinor: held,
    allocatablePositiveMinor: allocatable,
    activeReservedMinor: reserved,
    rawCapacityMinor: raw,
    capacityMinor: capacity,
    capacityCappedBySources: raw > allocatable,
  };
}

export function meetsPayoutMinimum(amountMinor: number): boolean {
  return amountMinor >= AUTHOR_PAYOUT_MINIMUM_MINOR;
}

export type AuthorPayoutAllocationPlan = {
  entryId: string;
  amountMinor: number;
};

/**
 * Mirrors the FIFO loop in public.create_author_payout_draft: oldest available
 * positive money first, partial claims allowed, ties broken by entry id.
 */
export function planPayoutAllocations(input: {
  entries: readonly AuthorPayoutSourceEntry[];
  amountMinor: number;
  cutoff?: Date | string;
}): {
  allocations: AuthorPayoutAllocationPlan[];
  allocatedMinor: number;
  shortfallMinor: number;
} {
  const cutoff = toCutoff(input.cutoff ?? new Date());
  const target = Math.max(0, Math.trunc(input.amountMinor));

  const sources = input.entries
    .filter(
      (entry) => entry.amountMinor > 0 && isAvailableAt(entry, cutoff),
    )
    .map((entry) => ({
      entryId: entry.entryId,
      effectiveAt: new Date(entry.effectiveAt).getTime(),
      remaining: Math.max(
        0,
        Math.trunc(entry.amountMinor) -
          Math.max(0, Math.trunc(entry.allocatedMinor ?? 0)),
      ),
    }))
    .filter((entry) => entry.remaining > 0)
    .sort(
      (a, b) =>
        a.effectiveAt - b.effectiveAt || a.entryId.localeCompare(b.entryId),
    );

  const allocations: AuthorPayoutAllocationPlan[] = [];
  let left = target;

  for (const source of sources) {
    if (left <= 0) break;
    const take = Math.min(source.remaining, left);
    allocations.push({ entryId: source.entryId, amountMinor: take });
    left -= take;
  }

  return {
    allocations,
    allocatedMinor: target - left,
    shortfallMinor: left,
  };
}

/**
 * Mirrors the validation order of public.create_author_payout_draft. Returns
 * the blocking code, or null when a draft may be created.
 */
export function payoutDraftBlocker(input: {
  payoutEligible: boolean;
  capacityMinor: number;
  desiredAmountMinor?: number | null;
  allowBelowMinimum?: boolean;
  overrideReason?: string | null;
}): string | null {
  if (!input.payoutEligible) return "author_not_payout_eligible";
  if (input.capacityMinor <= 0) return "no_payable_balance";

  const desired = input.desiredAmountMinor ?? null;
  if (desired !== null) {
    if (desired <= 0) return "invalid_payout_amount";
    if (desired > input.capacityMinor) return "desired_amount_exceeds_capacity";
  }

  const amount = desired ?? input.capacityMinor;
  if (!meetsPayoutMinimum(amount)) {
    if (!input.allowBelowMinimum) return "below_minimum_payout";
    if (!input.overrideReason?.trim()) return "override_reason_required";
  }

  return null;
}

/**
 * Mirrors public.author_payout_period: monthly cadence labelled in Moscow
 * time, so a payout created just after midnight UTC still belongs to the month
 * the finance team is actually closing.
 */
export function resolvePayoutPeriodLabel(cutoff: Date | string): string {
  const at = cutoff instanceof Date ? cutoff : new Date(cutoff);
  if (Number.isNaN(at.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AUTHOR_PAYOUT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

export const AUTHOR_PAYOUT_STATUS_LABELS: Record<AuthorPayoutStatus, string> = {
  draft: "Черновик",
  approved: "Одобрена",
  processing: "В переводе",
  paid: "Выплачена",
  failed: "Ошибка перевода",
  cancelled: "Отменена",
  requires_review: "Требует разбора",
  reversed: "Сторнирована",
};
