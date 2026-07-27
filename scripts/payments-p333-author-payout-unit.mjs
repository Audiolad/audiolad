#!/usr/bin/env node
/**
 * P3.3.3 pure unit tests: the payout threshold, the payable capacity with its
 * negative holdback, the FIFO allocation plan and the status machine — plus
 * the source contracts that keep this TypeScript mirror honest against the SQL
 * it duplicates.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLATFORM_ROLE_PERMISSIONS } from "../src/lib/auth/platform-permissions.ts";
import {
  AUTHOR_PAYOUT_ACTIVE_STATUSES,
  AUTHOR_PAYOUT_ALLOCATION_STATUSES,
  AUTHOR_PAYOUT_MINIMUM_MINOR,
  AUTHOR_PAYOUT_STATUSES,
  P333_CALCULATION_VERSION,
  computePayoutCapacity,
  isAuthorPayoutTerminal,
  isAuthorPayoutTransitionAllowed,
  meetsPayoutMinimum,
  payoutDraftBlocker,
  planPayoutAllocations,
  resolvePayoutPeriodLabel,
} from "../src/lib/payments/author-finance/payout-types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260727120000_payments_p333_author_payouts.sql",
);

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}

const CUTOFF = "2026-07-01T00:00:00Z";

function entry(id, amountMinor, effectiveAt, extra = {}) {
  return { entryId: id, amountMinor, effectiveAt, ...extra };
}

// ---------------------------------------------------------------------------

function testThreshold() {
  assertEqual(AUTHOR_PAYOUT_MINIMUM_MINOR, 100000, "the minimum is 1000 rubles");
  assert(meetsPayoutMinimum(100000), "exactly the minimum is payable");
  assert(!meetsPayoutMinimum(99999), "one kopek short is not payable");
  assert(!meetsPayoutMinimum(0), "nothing is not payable");
  assert(meetsPayoutMinimum(139400), "the real production gross would pass");
}

function testCapacity() {
  // Plain case: two available sales, nothing reserved.
  const plain = computePayoutCapacity({
    entries: [
      entry("a", 70000, "2026-02-10T10:00:00Z"),
      entry("b", 70000, "2026-03-10T10:00:00Z"),
    ],
    cutoff: CUTOFF,
  });
  assertEqual(plain.availableBalanceMinor, 140000, "both sales are available");
  assertEqual(plain.capacityMinor, 140000, "and all of it is payable");
  assertEqual(plain.heldMinor, 0, "nothing is held");

  // Held money is not payable, but it is not lost either.
  const held = computePayoutCapacity({
    entries: [
      entry("a", 70000, "2026-02-10T10:00:00Z"),
      entry("b", 70000, "2026-06-25T10:00:00Z", {
        availableAt: "2026-07-25T10:00:00Z",
      }),
    ],
    cutoff: CUTOFF,
  });
  assertEqual(held.capacityMinor, 70000, "only the released sale is payable");
  assertEqual(held.heldMinor, 70000, "the rest is reported as held");

  // A refund reversal is a global holdback, not a netting against one row.
  const negative = computePayoutCapacity({
    entries: [
      entry("a", 70000, "2026-02-10T10:00:00Z"),
      entry("b", 70000, "2026-03-10T10:00:00Z"),
      entry("r", -50000, "2026-04-10T10:00:00Z"),
    ],
    cutoff: CUTOFF,
  });
  assertEqual(negative.negativeAvailableMinor, 50000, "the debit is counted");
  assertEqual(negative.availableBalanceMinor, 90000, "it lowers the balance");
  assertEqual(negative.capacityMinor, 90000, "and therefore the capacity");
  assertEqual(
    negative.allocatablePositiveMinor,
    140000,
    "while the positive sources themselves are untouched",
  );

  // A balance that went negative can never produce a payout.
  const underwater = computePayoutCapacity({
    entries: [
      entry("a", 70000, "2026-02-10T10:00:00Z"),
      entry("r", -90000, "2026-04-10T10:00:00Z"),
    ],
    cutoff: CUTOFF,
  });
  assertEqual(underwater.availableBalanceMinor, -20000, "the author is in debt");
  assertEqual(underwater.capacityMinor, 0, "capacity floors at zero");

  // Open payouts hold their money back.
  const reserved = computePayoutCapacity({
    entries: [
      entry("a", 70000, "2026-02-10T10:00:00Z"),
      entry("b", 70000, "2026-03-10T10:00:00Z"),
    ],
    activeReservedMinor: 100000,
    cutoff: CUTOFF,
  });
  assertEqual(reserved.capacityMinor, 40000, "only the unreserved rest is free");

  // Already claimed sources cap the capacity even if the balance says more:
  // drift may only ever make us pay less.
  const claimed = computePayoutCapacity({
    entries: [
      entry("a", 70000, "2026-02-10T10:00:00Z", { allocatedMinor: 70000 }),
      entry("b", 70000, "2026-03-10T10:00:00Z", { allocatedMinor: 40000 }),
    ],
    cutoff: CUTOFF,
  });
  assertEqual(claimed.allocatablePositiveMinor, 30000, "30000 is unclaimed");
  assertEqual(claimed.capacityMinor, 30000, "and that caps the payout");
  assert(claimed.capacityCappedBySources, "the cap is reported explicitly");
}

function testFifoAllocation() {
  const entries = [
    entry("mar", 70000, "2026-03-10T10:00:00Z"),
    entry("feb", 70000, "2026-02-10T10:00:00Z"),
    entry("apr", 70000, "2026-04-10T10:00:00Z"),
  ];

  // Oldest money leaves first, and the last source is only partially claimed.
  const plan = planPayoutAllocations({
    entries,
    amountMinor: 100000,
    cutoff: CUTOFF,
  });
  assertEqual(plan.allocations.length, 2, "two sources cover the amount");
  assertEqual(plan.allocations[0].entryId, "feb", "February goes first");
  assertEqual(plan.allocations[0].amountMinor, 70000, "in full");
  assertEqual(plan.allocations[1].entryId, "mar", "then March");
  assertEqual(plan.allocations[1].amountMinor, 30000, "partially");
  assertEqual(plan.allocatedMinor, 100000, "the payout is fully funded");
  assertEqual(plan.shortfallMinor, 0, "nothing is missing");

  // The invariant: allocations always add up to the payout amount.
  assertEqual(
    plan.allocations.reduce((sum, item) => sum + item.amountMinor, 0),
    100000,
    "sum of allocations equals the payout",
  );

  // Partially consumed sources are respected.
  const partial = planPayoutAllocations({
    entries: [
      entry("feb", 70000, "2026-02-10T10:00:00Z", { allocatedMinor: 30000 }),
      entry("mar", 70000, "2026-03-10T10:00:00Z"),
    ],
    amountMinor: 100000,
    cutoff: CUTOFF,
  });
  assertEqual(partial.allocations[0].amountMinor, 40000, "only the rest of Feb");
  assertEqual(partial.allocations[1].amountMinor, 60000, "March covers the gap");

  // Held sources are invisible to the allocator.
  const withHeld = planPayoutAllocations({
    entries: [
      entry("held", 70000, "2026-06-25T10:00:00Z", {
        availableAt: "2026-07-25T10:00:00Z",
      }),
      entry("free", 70000, "2026-02-10T10:00:00Z"),
    ],
    amountMinor: 100000,
    cutoff: CUTOFF,
  });
  assertEqual(withHeld.allocatedMinor, 70000, "only the released sale is used");
  assertEqual(withHeld.shortfallMinor, 30000, "the gap is reported, not hidden");

  // Negative rows are never allocated: they are a holdback, not a source.
  const withNegative = planPayoutAllocations({
    entries: [
      entry("feb", 70000, "2026-02-10T10:00:00Z"),
      entry("refund", -50000, "2026-03-10T10:00:00Z"),
    ],
    amountMinor: 70000,
    cutoff: CUTOFF,
  });
  assertEqual(withNegative.allocations.length, 1, "one source only");
  assertEqual(withNegative.allocations[0].entryId, "feb", "the positive one");

  // Same instant on two rows still resolves deterministically.
  const tie = planPayoutAllocations({
    entries: [
      entry("b", 10000, "2026-02-10T10:00:00Z"),
      entry("a", 10000, "2026-02-10T10:00:00Z"),
    ],
    amountMinor: 15000,
    cutoff: CUTOFF,
  });
  assertEqual(tie.allocations[0].entryId, "a", "ties break on the entry id");
}

function testDraftBlockers() {
  assertEqual(
    payoutDraftBlocker({ payoutEligible: false, capacityMinor: 500000 }),
    "author_not_payout_eligible",
    "money alone does not make an author payable",
  );
  assertEqual(
    payoutDraftBlocker({ payoutEligible: true, capacityMinor: 0 }),
    "no_payable_balance",
    "nothing to pay",
  );
  assertEqual(
    payoutDraftBlocker({ payoutEligible: true, capacityMinor: 90000 }),
    "below_minimum_payout",
    "under the threshold the balance rolls over",
  );
  assertEqual(
    payoutDraftBlocker({
      payoutEligible: true,
      capacityMinor: 90000,
      allowBelowMinimum: true,
    }),
    "override_reason_required",
    "an override without a reason is refused",
  );
  assertEqual(
    payoutDraftBlocker({
      payoutEligible: true,
      capacityMinor: 90000,
      allowBelowMinimum: true,
      overrideReason: "closing the account",
    }),
    null,
    "a justified override passes",
  );
  assertEqual(
    payoutDraftBlocker({
      payoutEligible: true,
      capacityMinor: 200000,
      desiredAmountMinor: 300000,
    }),
    "desired_amount_exceeds_capacity",
    "the client can never widen the amount",
  );
  assertEqual(
    payoutDraftBlocker({
      payoutEligible: true,
      capacityMinor: 200000,
      desiredAmountMinor: -1,
    }),
    "invalid_payout_amount",
    "a negative request is refused",
  );
  assertEqual(
    payoutDraftBlocker({
      payoutEligible: true,
      capacityMinor: 200000,
      desiredAmountMinor: 150000,
    }),
    null,
    "a partial payout within the capacity passes",
  );
}

function testStatusMachine() {
  assert(
    isAuthorPayoutTransitionAllowed("draft", "approved"),
    "a draft can be approved",
  );
  assert(
    isAuthorPayoutTransitionAllowed("approved", "paid"),
    "an approved payout can be paid directly",
  );
  assert(
    isAuthorPayoutTransitionAllowed("paid", "reversed"),
    "a paid payout can only be reversed",
  );
  assert(
    !isAuthorPayoutTransitionAllowed("paid", "cancelled"),
    "a paid payout can never be cancelled",
  );
  assert(
    !isAuthorPayoutTransitionAllowed("cancelled", "draft"),
    "a cancelled payout is final",
  );
  assert(
    !isAuthorPayoutTransitionAllowed("reversed", "paid"),
    "a reversal is not undone by paying again",
  );
  assert(
    isAuthorPayoutTransitionAllowed("draft", "draft"),
    "repeating a transition is a replay, not an error",
  );

  for (const status of ["failed", "cancelled", "reversed"]) {
    assert(isAuthorPayoutTerminal(status), `${status} is terminal`);
  }
  assert(!isAuthorPayoutTerminal("paid"), "paid still allows a reversal");
}

function testPeriodLabel() {
  assertEqual(
    resolvePayoutPeriodLabel("2026-07-15T12:00:00Z"),
    "2026-07",
    "a mid-month cutoff labels its own month",
  );
  // 21:30 UTC on 30 June is already 1 July in Moscow: the label follows the
  // timezone the finance team actually closes the month in.
  assertEqual(
    resolvePayoutPeriodLabel("2026-06-30T21:30:00Z"),
    "2026-07",
    "the label is Moscow time, not UTC",
  );
  assertEqual(
    resolvePayoutPeriodLabel("2026-06-30T20:30:00Z"),
    "2026-06",
    "an hour earlier is still June",
  );
}

function testProductionShape() {
  // The real balance today: gross 139400, no refunds, no author ledger at all.
  const production = computePayoutCapacity({ entries: [], cutoff: CUTOFF });
  assertEqual(production.capacityMinor, 0, "no ledger means no payout");
  assertEqual(
    payoutDraftBlocker({ payoutEligible: false, capacityMinor: 0 }),
    "author_not_payout_eligible",
    "and no author is payout eligible yet",
  );
}

function testSourceContracts() {
  const sql = readFileSync(MIGRATION, "utf8");

  // Vocabulary has to match on both sides or the mirror is a lie.
  for (const status of AUTHOR_PAYOUT_STATUSES) {
    assert(sql.includes(`'${status}'`), `SQL knows the status ${status}`);
  }
  for (const status of AUTHOR_PAYOUT_ALLOCATION_STATUSES) {
    assert(
      sql.includes(`'${status}'`),
      `SQL knows the allocation status ${status}`,
    );
  }
  for (const status of AUTHOR_PAYOUT_ACTIVE_STATUSES) {
    assert(
      AUTHOR_PAYOUT_STATUSES.includes(status),
      `${status} is a real payout status`,
    );
  }
  assert(
    sql.includes(P333_CALCULATION_VERSION),
    "SQL stamps the same calculation version",
  );
  assert(
    sql.includes("SELECT 100000::bigint"),
    "SQL uses the same minimum payout",
  );
  assert(
    sql.includes("Europe/Moscow"),
    "SQL builds the period label in Moscow time",
  );

  // The reservation model: allocations, never ledger rows.
  assert(
    /INSERT INTO public\.author_payout_allocations/.test(sql),
    "drafts reserve through allocations",
  );
  assert(
    /ORDER BY e\.effective_at, e\.entry_id/.test(sql),
    "the allocation order is FIFO with a deterministic tiebreak",
  );

  // Only the paid step may touch the ledger, and only through an insert.
  const ledgerWrites = sql.match(/INSERT INTO public\.author_ledger_entries/g);
  assertEqual(
    ledgerWrites?.length ?? 0,
    2,
    "exactly two ledger writes exist: the payout and its reversal",
  );
  assert(
    !/UPDATE\s+public\.author_ledger_entries/i.test(sql),
    "no statement rewrites an existing ledger row",
  );
  assert(
    !/DELETE\s+FROM\s+public\.author_ledger_entries/i.test(sql),
    "no statement deletes a ledger row",
  );

  // Earlier phases are not redefined here.
  for (const fn of [
    "admin_payments_p31_summary",
    "ensure_author_sale_accrual",
    "ensure_author_refund_reversal",
    "confirm_payment_refund",
  ]) {
    assert(
      !new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`).test(sql),
      `P3.3.3 does not redefine ${fn}`,
    );
  }
  assert(
    !/UPDATE\s+(public\.)?authors[\s\S]{0,200}?SET[\s\S]{0,200}?payout_eligible/i.test(
      sql,
    ),
    "the migration never grants payout eligibility",
  );
  assert(
    !/INSERT INTO public\.author_payouts[\s\S]{0,400}?VALUES[\s\S]{0,200}?;/.test(
      sql.split("CREATE OR REPLACE FUNCTION")[0],
    ),
    "the migration itself seeds no payout row",
  );

  // Bank details are a deliberate absence, not an oversight.
  for (const column of ["iban", "bic", "account_number", "card_number", "inn"]) {
    assert(!sql.includes(column), `no ${column} column is created`);
  }
  assert(sql.includes("not_stored"), "the projections say so explicitly");

  // Permissions must exist on both sides and stay with owner and finance.
  for (const code of [
    "finance.payouts.view",
    "finance.payouts.create",
    "finance.payouts.approve",
    "finance.payouts.mark_paid",
    "finance.payouts.reverse",
    "finance.payouts.manage",
  ]) {
    assert(sql.includes(`'${code}'`), `SQL seeds ${code}`);
    assert(
      PLATFORM_ROLE_PERMISSIONS.owner.includes(code),
      `owner holds ${code}`,
    );
    assert(
      PLATFORM_ROLE_PERMISSIONS.finance.includes(code),
      `finance holds ${code}`,
    );
    for (const role of ["admin", "editor", "support", "analyst"]) {
      assert(
        !PLATFORM_ROLE_PERMISSIONS[role].includes(code),
        `${role} does not hold ${code}`,
      );
    }
  }

  // The UI must not be able to send an amount the server did not compute.
  const route = readFileSync(
    join(ROOT, "src/app/api/admin/finance/payouts/route.ts"),
    "utf8",
  );
  assert(
    route.includes("desiredAmountMinor"),
    "the API only accepts a narrowing request",
  );
  assert(
    !/amountMinor\s*:\s*body/.test(route),
    "the API never takes the payout amount from the client",
  );
}

function main() {
  testThreshold();
  testCapacity();
  testFifoAllocation();
  testDraftBlockers();
  testStatusMachine();
  testPeriodLabel();
  testProductionShape();
  testSourceContracts();

  console.log("payments-p333-author-payout-unit: ok");
}

main();
