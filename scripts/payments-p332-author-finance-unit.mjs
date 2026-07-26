#!/usr/bin/env node
/**
 * P3.3.2 pure unit tests: share math, cumulative refund reversal, hold
 * classification, balance derivation and the source contracts that keep the
 * TypeScript mirror honest against the SQL it duplicates.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  accrualBlocker,
  authorShareMinor,
  AUTHOR_LEDGER_ENTRY_TYPES,
  AUTHOR_TERMS_STATUSES,
  classifyHold,
  computeAuthorBalance,
  computeRefundReversalMinor,
  FINANCE_OBLIGATION_STATUSES,
  holdAvailableAt,
  isValidHoldDays,
  isValidShareBps,
  P332_CALCULATION_VERSION,
} from "../src/lib/payments/author-finance/types.ts";
import { PLATFORM_ROLE_PERMISSIONS } from "../src/lib/auth/platform-permissions.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260726140000_payments_p332_author_ledger.sql",
);

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}

// ---------------------------------------------------------------------------

function testShareMath() {
  // The real production number: 6 sales at 29900, gross 139400.
  assertEqual(authorShareMinor(139400, 7000), 97580, "70% of the real gross");
  assertEqual(authorShareMinor(29900, 7000), 20930, "70% of one sale");
  assertEqual(authorShareMinor(29900, 3000), 8970, "30% of one sale");

  // Rounding always favours the platform: never hand out a kopek we don't have.
  assertEqual(authorShareMinor(29900, 3333), 9965, "33.33% floors down");
  assertEqual(authorShareMinor(1, 5000), 0, "half a kopek floors to zero");
  assertEqual(authorShareMinor(3, 3333), 0, "sub-kopek floors to zero");
  assertEqual(authorShareMinor(99, 9999), 98, "99 at 99.99% floors to 98");

  // Boundaries.
  assertEqual(authorShareMinor(29900, 10000), 29900, "100% is the whole sale");
  assertEqual(authorShareMinor(29900, 0), 0, "0% is nothing");
  assertEqual(authorShareMinor(0, 7000), 0, "no basis, no share");
  assertEqual(authorShareMinor(-100, 7000), 0, "negative basis is refused");
  assertEqual(authorShareMinor(29900, -1), 0, "negative share is refused");
  assertEqual(authorShareMinor(Number.NaN, 7000), 0, "NaN basis is refused");

  // Integer math end to end: no float artefacts at scale.
  assertEqual(
    authorShareMinor(999999999, 7000),
    699999999,
    "large basis stays exact",
  );
  for (let basis = 0; basis <= 2000; basis += 1) {
    const share = authorShareMinor(basis, 7000);
    assert(Number.isInteger(share), `share is an integer at basis ${basis}`);
    assert(share <= basis, `share never exceeds basis at ${basis}`);
  }
}

function testCumulativeReversal() {
  const shareBps = 7000;
  const grossBasisMinor = 29900;
  const saleAccrualMinor = authorShareMinor(grossBasisMinor, shareBps);
  assertEqual(saleAccrualMinor, 20930, "starting accrual");

  // First partial refund.
  const first = computeRefundReversalMinor({
    saleAccrualMinor,
    grossBasisMinor,
    cumulativeRefundedMinor: 10000,
    existingReversalsMinor: 0,
    shareBps,
  });
  assertEqual(first.targetMinor, 13930, "target after 10000 refunded");
  assertEqual(first.reversalMinor, -7000, "first reversal");

  // Second partial refund reverses only the delta.
  const second = computeRefundReversalMinor({
    saleAccrualMinor,
    grossBasisMinor,
    cumulativeRefundedMinor: 19900,
    existingReversalsMinor: -7000,
    shareBps,
  });
  assertEqual(second.targetMinor, 7000, "target after 19900 refunded");
  assertEqual(second.reversalMinor, -6930, "second reversal is the delta only");

  // Full refund lands exactly on zero.
  const third = computeRefundReversalMinor({
    saleAccrualMinor,
    grossBasisMinor,
    cumulativeRefundedMinor: 29900,
    existingReversalsMinor: -13930,
    shareBps,
  });
  assertEqual(third.targetMinor, 0, "nothing is kept after a full refund");
  assertEqual(third.reversalMinor, -7000, "third reversal closes the position");
  assertEqual(
    saleAccrualMinor + (-7000 - 6930 - 7000),
    0,
    "the ledger sums to zero",
  );

  // Replaying an already-applied refund writes nothing.
  const replay = computeRefundReversalMinor({
    saleAccrualMinor,
    grossBasisMinor,
    cumulativeRefundedMinor: 29900,
    existingReversalsMinor: -20930,
    shareBps,
  });
  assertEqual(replay.reversalMinor, 0, "a settled position reverses nothing");

  // Over-refund (should be impossible upstream) clamps rather than inverting.
  const over = computeRefundReversalMinor({
    saleAccrualMinor,
    grossBasisMinor,
    cumulativeRefundedMinor: 40000,
    existingReversalsMinor: 0,
    shareBps,
  });
  assertEqual(over.netBasisMinor, 0, "net basis never goes negative");
  assertEqual(over.targetMinor, 0, "target never goes negative");
  assertEqual(over.reversalMinor, -20930, "the whole accrual is reversed");

  // Order independence: many small refunds converge on one big refund.
  let existing = 0;
  let refunded = 0;
  for (let step = 0; step < 299; step += 1) {
    refunded += 100;
    const result = computeRefundReversalMinor({
      saleAccrualMinor,
      grossBasisMinor,
      cumulativeRefundedMinor: refunded,
      existingReversalsMinor: existing,
      shareBps,
    });
    existing += result.reversalMinor;
  }
  assertEqual(refunded, 29900, "the sale is fully refunded in small steps");
  assertEqual(
    saleAccrualMinor + existing,
    0,
    "299 partial refunds converge on the same zero",
  );

  // A rounding-heavy rate still converges.
  const oddShare = 3333;
  const oddAccrual = authorShareMinor(grossBasisMinor, oddShare);
  let oddExisting = 0;
  let oddRefunded = 0;
  for (let step = 0; step < 100; step += 1) {
    oddRefunded += 299;
    const result = computeRefundReversalMinor({
      saleAccrualMinor: oddAccrual,
      grossBasisMinor,
      cumulativeRefundedMinor: oddRefunded,
      existingReversalsMinor: oddExisting,
      shareBps: oddShare,
    });
    assert(result.reversalMinor <= 0, "a reversal never adds money");
    oddExisting += result.reversalMinor;
  }
  assertEqual(
    oddAccrual + oddExisting,
    0,
    "an odd rate also converges on zero",
  );
}

function testHoldClassification() {
  const now = new Date("2026-07-26T00:00:00Z");

  assertEqual(
    classifyHold("2026-08-01T00:00:00Z", now),
    "held",
    "a future release date is held",
  );
  assertEqual(
    classifyHold("2026-07-01T00:00:00Z", now),
    "payable",
    "a past release date is payable",
  );
  assertEqual(
    classifyHold("2026-07-26T00:00:00Z", now),
    "payable",
    "the release moment itself is payable",
  );
  assertEqual(classifyHold(null, now), "payable", "no hold means payable");
  assertEqual(
    classifyHold("not-a-date", now),
    "payable",
    "an unparseable date does not trap money",
  );
}

function testBalance() {
  const now = new Date("2026-07-26T00:00:00Z");

  const balance = computeAuthorBalance(
    [
      { paymentId: "p1", netMinor: 20930, availableAt: "2026-08-10T00:00:00Z" },
      { paymentId: "p2", netMinor: 7000, availableAt: "2026-07-01T00:00:00Z" },
      { paymentId: "p3", netMinor: 0, availableAt: "2026-07-01T00:00:00Z" },
    ],
    -500,
    now,
  );

  assertEqual(balance.heldMinor, 20930, "the fresh sale is held");
  assertEqual(balance.payableMinor, 6500, "released sale minus the adjustment");
  assertEqual(
    balance.netEntitlementMinor,
    balance.heldMinor + balance.payableMinor,
    "net is held plus payable",
  );

  // A fully reversed payment contributes nothing to either bucket.
  const settled = computeAuthorBalance(
    [{ paymentId: "p1", netMinor: 0, availableAt: "2026-08-10T00:00:00Z" }],
    0,
    now,
  );
  assertEqual(settled.netEntitlementMinor, 0, "a refunded sale leaves nothing");

  // Adjustments are payable immediately: they are not tied to a sale.
  const adjustmentOnly = computeAuthorBalance([], 2500, now);
  assertEqual(adjustmentOnly.heldMinor, 0, "an adjustment is never held");
  assertEqual(adjustmentOnly.payableMinor, 2500, "an adjustment is payable");
}

function testAccrualEligibility() {
  const eligible = {
    paymentSucceeded: true,
    hasAuthorSnapshot: true,
    payoutEligible: true,
    termsMatchCount: 1,
  };

  assertEqual(accrualBlocker(eligible), null, "a complete case accrues");
  assertEqual(
    accrualBlocker({ ...eligible, paymentSucceeded: false }),
    "payment_not_succeeded",
    "an unconfirmed payment accrues nothing",
  );
  assertEqual(
    accrualBlocker({ ...eligible, hasAuthorSnapshot: false }),
    "author_snapshot_missing",
    "a missing write-time author is never guessed",
  );
  assertEqual(
    accrualBlocker({ ...eligible, payoutEligible: false }),
    "author_not_payout_eligible",
    "the platform catalog accrues nothing",
  );
  assertEqual(
    accrualBlocker({ ...eligible, termsMatchCount: 0 }),
    "no_active_terms",
    "a missing rate is never invented",
  );
  assertEqual(
    accrualBlocker({ ...eligible, termsMatchCount: 2 }),
    "ambiguous_terms",
    "two candidate rates are refused, not picked between",
  );

  // Order of checks matters for the operator's error message.
  assertEqual(
    accrualBlocker({
      paymentSucceeded: false,
      hasAuthorSnapshot: false,
      payoutEligible: false,
      termsMatchCount: 0,
    }),
    "payment_not_succeeded",
    "the payment gate is reported first",
  );
}

/** The production classification the ledger must reproduce. */
function testProductionClassification() {
  const authors = [
    { slug: "sergey-petrov", accessStatus: "commercial", payoutEligible: false },
    { slug: "zoya-petrova", accessStatus: "commercial", payoutEligible: false },
    { slug: "sergey-and-zoya", accessStatus: "commercial", payoutEligible: false },
    {
      slug: "german-semenuk",
      accessStatus: "commercial_pending",
      payoutEligible: false,
    },
    { slug: "sergej-andeks", accessStatus: "free", payoutEligible: false },
    { slug: "sergio", accessStatus: "free", payoutEligible: false },
  ];

  for (const author of authors) {
    assertEqual(
      accrualBlocker({
        paymentSucceeded: true,
        hasAuthorSnapshot: true,
        payoutEligible: author.payoutEligible,
        termsMatchCount: 1,
      }),
      "author_not_payout_eligible",
      `${author.slug}: no accrual without an explicit payout decision`,
    );
  }

  // All six real succeeded payments (139400 gross) are platform-owned, so the
  // ledger has to stay empty no matter what rate anyone would apply.
  const REAL_GROSS_MINOR = 139400;
  const owed =
    accrualBlocker({
      paymentSucceeded: true,
      hasAuthorSnapshot: true,
      payoutEligible: false,
      termsMatchCount: 1,
    }) === null
      ? authorShareMinor(REAL_GROSS_MINOR, 7000)
      : 0;
  assertEqual(owed, 0, "nothing is owed on the current production catalog");

  // The historical orders carry no author snapshot, which blocks accrual on its
  // own even if someone flipped payout eligibility on by mistake.
  assertEqual(
    accrualBlocker({
      paymentSucceeded: true,
      hasAuthorSnapshot: false,
      payoutEligible: true,
      termsMatchCount: 1,
    }),
    "author_snapshot_missing",
    "historical orders cannot accrue without a write-time author",
  );
}

function testValidators() {
  assert(isValidShareBps(0), "0 bps is a valid rate");
  assert(isValidShareBps(7000), "7000 bps is a valid rate");
  assert(isValidShareBps(10000), "10000 bps is a valid rate");
  assert(!isValidShareBps(10001), "over 100% is refused");
  assert(!isValidShareBps(-1), "a negative rate is refused");
  assert(!isValidShareBps(70.5), "a fractional basis point is refused");

  assert(isValidHoldDays(0), "no hold is valid");
  assert(isValidHoldDays(14), "the default hold is valid");
  assert(!isValidHoldDays(366), "an absurd hold is refused");
  assert(!isValidHoldDays(-1), "a negative hold is refused");

  assertEqual(
    holdAvailableAt("2026-07-11T10:00:00.000Z", 14),
    "2026-07-25T10:00:00.000Z",
    "the hold window is exactly hold_days after confirmation",
  );
  assertEqual(
    holdAvailableAt("2026-07-11T10:00:00.000Z", 0),
    "2026-07-11T10:00:00.000Z",
    "a zero hold releases at confirmation",
  );
  assertEqual(holdAvailableAt("nonsense", 14), null, "a bad date yields no hold");
}

/** Guards against the TS mirror drifting away from the SQL it duplicates. */
function testSourceContracts() {
  const sql = readFileSync(MIGRATION, "utf8");

  assertEqual(P332_CALCULATION_VERSION, "p332.v1", "TS pins the version");
  assert(sql.includes("'p332.v1'"), "SQL pins the same calculation version");

  assertEqual(
    AUTHOR_LEDGER_ENTRY_TYPES.join(","),
    "sale_accrual,refund_reversal,manual_credit,manual_debit,correction",
    "the approved entry type vocabulary",
  );
  for (const entryType of AUTHOR_LEDGER_ENTRY_TYPES) {
    assert(sql.includes(`'${entryType}'`), `SQL knows the ${entryType} entry type`);
  }

  assertEqual(
    AUTHOR_TERMS_STATUSES.join(","),
    "draft,approved,superseded,cancelled",
    "the approved terms status vocabulary",
  );
  for (const status of AUTHOR_TERMS_STATUSES) {
    assert(sql.includes(`'${status}'`), `SQL knows the ${status} terms status`);
  }

  for (const status of FINANCE_OBLIGATION_STATUSES) {
    assert(sql.includes(`'${status}'`), `SQL knows the ${status} obligation status`);
  }

  // The floor formula must be integer division in SQL, not a numeric cast.
  assert(
    sql.includes("author_share_minor"),
    "SQL exposes the shared share function",
  );
  assert(
    /\(p_basis_minor \* p_share_bps::bigint\) \/ 10000::bigint/.test(sql),
    "SQL computes the share with bigint division, not a float",
  );
  assert(
    !/p_basis_minor[^;]{0,80}::(numeric|float|double precision|real)/.test(sql),
    "SQL never casts the basis to a floating point type",
  );

  // The ledger must be append-only and applying the migration must move no
  // money. Function bodies are stripped first: an INSERT inside an RPC only
  // runs when an operator calls it, which is exactly what we want.
  const statements = sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, " BODY ");

  assert(
    sql.includes("author_ledger_entries_append_only"),
    "SQL blocks ledger mutation",
  );
  assert(
    !/INSERT INTO public\.author_ledger_entries/i.test(statements),
    "applying the migration writes no ledger rows",
  );
  assert(
    !/INSERT INTO public\.author_commercial_terms/i.test(statements),
    "applying the migration seeds no commercial terms",
  );
  assert(
    !/INSERT INTO public\.finance_obligations/i.test(statements),
    "applying the migration enqueues no obligations",
  );
  assert(
    sql.includes("payout_eligible boolean NOT NULL DEFAULT false"),
    "payout eligibility defaults to false for every author",
  );
  assert(
    !/UPDATE\s+(public\.)?authors[\s\S]{0,200}?SET[\s\S]{0,200}?payout_eligible/i.test(
      sql,
    ),
    "no statement in the migration ever writes payout eligibility",
  );
  assert(
    /INSERT INTO public\.author_ledger_entries/i.test(sql),
    "the RPCs are still the path that appends ledger rows",
  );

  // Write-time attribution is the only accepted basis for an accrual, so the
  // P3.2.0 order snapshot has to keep being written and must not be redefined
  // here.
  const p320 = readFileSync(
    join(
      ROOT,
      "supabase/migrations/20260725194000_orders_p320_attribution_snapshot.sql",
    ),
    "utf8",
  );
  assert(
    /author_id_snapshot\s*=\s*coalesce\(o\.author_id_snapshot, v_practice\.author_id\)/.test(
      p320,
    ),
    "create_practice_order still snapshots the author on every new order",
  );
  assert(
    !/CREATE OR REPLACE FUNCTION public\.create_practice_order/.test(sql),
    "P3.3.2 does not redefine order creation",
  );
  assert(
    !/CREATE OR REPLACE FUNCTION public\.admin_payments_p31_summary/.test(sql),
    "P3.3.2 does not redefine the P3.1 gross methodology",
  );
  assert(
    !/UPDATE\s+(public\.)?orders[\s\S]{0,200}?SET[\s\S]{0,200}?author_id_snapshot/i.test(
      sql,
    ),
    "P3.3.2 backfills no historical attribution",
  );

  // Permissions have to exist and match on both sides.
  for (const code of [
    "finance.terms.manage",
    "finance.ledger.manage",
    "finance.adjustments.manage",
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
}

function main() {
  testShareMath();
  testCumulativeReversal();
  testHoldClassification();
  testBalance();
  testAccrualEligibility();
  testProductionClassification();
  testValidators();
  testSourceContracts();

  console.log("payments-p332-author-finance-unit: ok");
}

main();
