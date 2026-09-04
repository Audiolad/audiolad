#!/usr/bin/env node
/**
 * P3.3.4 pure unit tests: the author-facing wording, the empty-state matrix,
 * reference masking, the CSV export guard and the activity period — plus the
 * source contracts that keep this TypeScript mirror honest against the SQL it
 * duplicates.
 *
 * No database, no network. Anything that needs one lives in
 * payments-p334-author-finance-sql-unit.mjs.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { escapeCsvCell } from "../src/lib/admin/analytics-csv.ts";

import {
  AUTHOR_FINANCE_CSV_COLUMNS,
  AUTHOR_FINANCE_HOLD_DAYS_LABEL,
  AUTHOR_FINANCE_KPI_HINTS,
  AUTHOR_FINANCE_KPI_LABELS,
  AUTHOR_FINANCE_METHODOLOGY,
  AUTHOR_FINANCE_MINIMUM_PAYOUT_TEXT,
  AUTHOR_FINANCE_NEGATIVE_WARNING,
  AUTHOR_FINANCE_NEXT_AVAILABLE_PREFIX,
  formatAuthorFinanceHoldDays,
  getAuthorFinanceAmountStateLabel,
  getAuthorFinanceEligibilityMessage,
  getAuthorFinanceEmptyStateCopy,
  getAuthorFinanceIntegrityMessage,
  getAuthorFinancePayoutStatusLabel,
  getAuthorFinancePayoutStatusMessage,
  getAuthorFinancePeriodLabel,
  getAuthorFinanceTermsStatusLabel,
  getAuthorFinanceTypeLabel,
} from "../src/lib/author-finance/labels.ts";
import {
  AUTHOR_FINANCE_AMOUNT_STATES,
  AUTHOR_FINANCE_EMPTY_STATE_CODES,
  AUTHOR_FINANCE_FORBIDDEN_FIELDS,
  AUTHOR_FINANCE_INTEGRITY_STATUSES,
  AUTHOR_FINANCE_MINIMUM_PAYOUT_MINOR,
  AUTHOR_FINANCE_PAYOUT_STATUS_KEYS,
  AUTHOR_FINANCE_PERIODS,
  AUTHOR_FINANCE_TERMS_STATUSES,
  AUTHOR_FINANCE_TYPE_KEYS,
  authorFinancePayoutStatusKey,
  authorFinanceTypeKey,
  maskPayoutReference,
  meetsAuthorPayoutThreshold,
  resolveAuthorFinancePeriodRange,
  resolveAuthorFinanceAuthorTermsUi,
  selectAuthorFinanceEmptyState,
} from "../src/lib/author-finance/types.ts";
import {
  AuthorFinanceExportError,
  assertNoForbiddenExportFields,
  buildAuthorFinanceExportFilename,
  buildAuthorFinanceLedgerCsv,
  buildAuthorFinancePayoutsCsv,
  formatMinorForCsv,
  isAuthorFinanceExportKind,
} from "../src/lib/author-finance/csv.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260727140000_payments_p334_author_finance.sql",
);
const EMPTY_STATE_MIGRATION = join(
  ROOT,
  "supabase/migrations/20260728160000_author_finance_empty_state_access_status.sql",
);
const AUTHOR_TERMS_EMPTY_STATE_MIGRATION = join(
  ROOT,
  "supabase/migrations/20260728170000_author_finance_author_terms_empty_state.sql",
);

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
function assertEqual(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}
function assertThrows(fn, label) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, `${label}: expected a throw`);
}

const CYRILLIC = /[А-Яа-яЁё]/;

// ---------------------------------------------------------------------------

function testLabelsAreComplete() {
  for (const key of AUTHOR_FINANCE_TYPE_KEYS) {
    const label = getAuthorFinanceTypeLabel(key);
    assert(CYRILLIC.test(label), `type ${key} has a Russian label`);
    assert(label !== key, `type ${key} is not rendered as its key`);
  }

  for (const state of AUTHOR_FINANCE_AMOUNT_STATES) {
    const label = getAuthorFinanceAmountStateLabel(state);
    assert(CYRILLIC.test(label), `amount state ${state} has a Russian label`);
    assert(label !== state, `amount state ${state} is not rendered as its key`);
  }

  for (const key of AUTHOR_FINANCE_PAYOUT_STATUS_KEYS) {
    const label = getAuthorFinancePayoutStatusLabel(key);
    assert(CYRILLIC.test(label), `payout status ${key} has a Russian label`);
    assert(label !== key, `payout status ${key} is not rendered as its key`);
  }

  for (const status of AUTHOR_FINANCE_TERMS_STATUSES) {
    assert(
      CYRILLIC.test(getAuthorFinanceTermsStatusLabel(status)),
      `terms status ${status} has a Russian label`,
    );
  }

  for (const period of AUTHOR_FINANCE_PERIODS) {
    assert(
      CYRILLIC.test(getAuthorFinancePeriodLabel(period)),
      `period ${period} has a Russian label`,
    );
  }

  for (const code of AUTHOR_FINANCE_EMPTY_STATE_CODES) {
    const copy = getAuthorFinanceEmptyStateCopy(code);
    assert(CYRILLIC.test(copy.title), `empty state ${code} has a title`);
    assert(CYRILLIC.test(copy.body), `empty state ${code} has a body`);
    assert(copy.title !== code, `empty state ${code} is not rendered as its key`);
  }

  // Every KPI the spec asks for is named, and named in Russian.
  for (const [kpi, label] of Object.entries(AUTHOR_FINANCE_KPI_LABELS)) {
    assert(CYRILLIC.test(label), `kpi ${kpi} has a Russian label`);
  }
  assertEqual(AUTHOR_FINANCE_KPI_LABELS.accrued, "Начислено", "kpi accrued");
  assertEqual(AUTHOR_FINANCE_KPI_LABELS.held, "Сохраняется", "kpi held");
  assertEqual(
    AUTHOR_FINANCE_KPI_HINTS.accrued,
    "Все начисления за всё время.",
    "accrued hint is not sale-only",
  );
  assertEqual(
    AUTHOR_FINANCE_KPI_HINTS.held,
    "Деньги уже ваши, но ещё идёт период сохранения.",
    "held hint uses preservation wording",
  );
  assertEqual(
    getAuthorFinanceAmountStateLabel("held"),
    "Сохраняется",
    "amount state held maps to preservation copy",
  );
  assertEqual(
    AUTHOR_FINANCE_HOLD_DAYS_LABEL,
    "Срок до доступности",
    "hold days label",
  );
  assertEqual(
    AUTHOR_FINANCE_NEXT_AVAILABLE_PREFIX,
    "Станет доступно",
    "next available prefix",
  );
  const payeeSetup = readFileSync(
    join(ROOT, "src/lib/authors/ensure-commercial-payee-setup.ts"),
    "utf8",
  );
  assert(
    /export const DEFAULT_COMMERCIAL_HOLD_DAYS = 14;/.test(payeeSetup),
    "14-day period unchanged",
  );
  assertEqual(
    formatAuthorFinanceHoldDays(14),
    "14 дней",
    "Срок до доступности shows 14 days",
  );
  assertEqual(
    `${AUTHOR_FINANCE_HOLD_DAYS_LABEL}: ${formatAuthorFinanceHoldDays(14)}`,
    "Срок до доступности: 14 дней",
    "composed hold-days copy",
  );

  const heldOnly = getAuthorFinanceEmptyStateCopy("held_only");
  assertEqual(heldOnly.title, "Сохранённые начисления", "held_only title");
  assertEqual(
    heldOnly.body,
    "Начисления уже сохранены за вами. После завершения периода сохранения сумма станет доступна к выплате.",
    "held_only body",
  );
  assert(
    !AUTHOR_FINANCE_METHODOLOGY.some((item) =>
      `${item.title} ${item.body}`.includes("удерж"),
    ),
    "methodology has no удерж wording",
  );
  assertEqual(
    AUTHOR_FINANCE_KPI_LABELS.payable,
    "Доступно к будущей выплате",
    "kpi payable",
  );
  assertEqual(
    AUTHOR_FINANCE_KPI_LABELS.reserved,
    "Зарезервировано",
    "kpi reserved",
  );
  assertEqual(AUTHOR_FINANCE_KPI_LABELS.paid, "Выплачено", "kpi paid");

  assert(
    AUTHOR_FINANCE_METHODOLOGY.length >= 4,
    "the methodology block explains at least accrual, hold, refunds and payout",
  );
  assert(
    AUTHOR_FINANCE_METHODOLOGY[0].body.includes("в пользу автора"),
    "accrual methodology rounds in favour of the author",
  );
  assert(
    !AUTHOR_FINANCE_METHODOLOGY[0].body.includes("в пользу платформы"),
    "accrual methodology no longer rounds in favour of the platform",
  );
  assert(
    AUTHOR_FINANCE_MINIMUM_PAYOUT_TEXT.includes("1000 ₽"),
    "the minimum payout is stated in rubles",
  );
  assert(
    CYRILLIC.test(AUTHOR_FINANCE_NEGATIVE_WARNING),
    "the negative balance warning is written for a human",
  );
}

/**
 * An author must never be told a reason that belongs to the operator. The
 * public-safe messages for the two "something is wrong" states are checked
 * against the internal vocabulary they must not repeat.
 */
function testPublicSafeMessages() {
  const internalWords = [
    "provider",
    "failure_code",
    "review_reason",
    "operator",
    "админ",
    "оператор",
    "код ошибки",
    "банк",
  ];

  const messages = [
    getAuthorFinancePayoutStatusMessage("delayed"),
    getAuthorFinancePayoutStatusMessage("on_review"),
    getAuthorFinancePayoutStatusMessage("cancelled"),
    getAuthorFinanceIntegrityMessage("review_required"),
    getAuthorFinanceIntegrityMessage("processing"),
  ];

  for (const message of messages) {
    assert(message !== null, "the state has a public-safe message");
    assert(CYRILLIC.test(message), "the message is in Russian");
    for (const word of internalWords) {
      assert(
        !message.toLowerCase().includes(word),
        `the message does not mention "${word}"`,
      );
    }
  }

  assertEqual(
    getAuthorFinancePayoutStatusMessage("paid"),
    null,
    "a settled payout needs no explanation",
  );
  assertEqual(
    getAuthorFinanceIntegrityMessage("ok"),
    null,
    "a healthy cabinet shows no banner",
  );

  for (const status of AUTHOR_FINANCE_INTEGRITY_STATUSES) {
    const message = getAuthorFinanceIntegrityMessage(status);
    assert(
      status === "ok" ? message === null : CYRILLIC.test(message),
      `integrity status ${status} resolves to the right message`,
    );
  }

  assertEqual(
    getAuthorFinanceEligibilityMessage("negative_balance"),
    AUTHOR_FINANCE_NEGATIVE_WARNING,
    "a negative balance outranks the empty state message",
  );
  assertEqual(
    getAuthorFinanceEligibilityMessage("active_ok"),
    getAuthorFinanceEmptyStateCopy("active_ok").body,
    "any other key falls through to the empty state copy",
  );
}

function testTypeAndStatusMapping() {
  assertEqual(authorFinanceTypeKey("sale_accrual"), "sale", "sale accrual");
  assertEqual(authorFinanceTypeKey("refund_reversal"), "refund", "refund");
  assertEqual(
    authorFinanceTypeKey("manual_credit"),
    "adjustment_credit",
    "manual credit",
  );
  assertEqual(authorFinanceTypeKey("payout"), "payout", "payout");
  assertEqual(authorFinanceTypeKey("something_new"), "other", "unknown type");

  // draft and approved are one state on purpose: the internal workflow step is
  // not the author's business.
  assertEqual(
    authorFinancePayoutStatusKey("draft"),
    "preparing",
    "draft is preparing",
  );
  assertEqual(
    authorFinancePayoutStatusKey("approved"),
    "preparing",
    "approved is also preparing",
  );
  assertEqual(
    authorFinancePayoutStatusKey("failed"),
    "delayed",
    "a failed transfer reads as delayed",
  );
  assertEqual(
    authorFinancePayoutStatusKey("requires_review"),
    "on_review",
    "requires_review is on_review",
  );
  assertEqual(
    authorFinancePayoutStatusKey("nonsense"),
    "unknown",
    "unknown status",
  );
}

function testEmptyStateMatrix() {
  const base = {
    payoutEligible: true,
    accessStatus: "commercial",
    approvedTermsCount: 1,
    entryCount: 3,
    payableMinor: 0,
    reservedMinor: 0,
    heldMinor: 0,
    paidPayoutCount: 0,
  };

  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: false,
      accessStatus: "free",
    }),
    "not_payout_eligible_free",
    "a free author",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: false,
      accessStatus: "commercial_pending",
    }),
    "not_payout_eligible_pending",
    "a pending commercial application",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: false,
      accessStatus: "commercial",
    }),
    "not_payout_eligible_commercial",
    "legacy commercial but not a payee",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: false,
      accessStatus: "commercial_onboarding",
      entryCount: 0,
      authorTermsAccepted: false,
    }),
    "author_terms_required",
    "onboarding without Author Terms asks to accept them",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: false,
      accessStatus: "commercial_onboarding",
      entryCount: 0,
      authorTermsAccepted: true,
    }),
    "commercial_onboarding_incomplete",
    "onboarding with Author Terms stays onboarding",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: false,
      accessStatus: "commercial_suspended",
    }),
    "access_suspended",
    "commercial_suspended is not free",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: true,
      accessStatus: "suspended",
    }),
    "access_suspended",
    "suspended outranks payout eligibility",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: false,
      accessStatus: "terminated",
    }),
    "access_terminated",
    "terminated is not free",
  );

  // commercial_active + Author Terms accepted must never look like a free
  // account or like finance terms are still awaiting agreement.
  const germanLike = {
    ...base,
    payoutEligible: false,
    accessStatus: "commercial_active",
    approvedTermsCount: 0,
    entryCount: 0,
    payableMinor: 0,
    authorTermsAccepted: true,
  };
  assertEqual(
    selectAuthorFinanceEmptyState(germanLike),
    "no_sales",
    "commercial_active with Author Terms and no sales stays operational",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...germanLike,
      approvedTermsCount: 0,
      payableMinor: 0,
      entryCount: 0,
    }),
    "no_sales",
    "missing finance terms rows do not block commercial_active UI",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...germanLike,
      authorTermsAccepted: false,
    }),
    "author_terms_required",
    "commercial_active without Author Terms asks to accept them",
  );

  const freeCopy = getAuthorFinanceEmptyStateCopy("not_payout_eligible_free");
  assert(
    freeCopy.body.includes("бесплатный"),
    "the free empty state still mentions a free account",
  );
  for (const scenario of [
    germanLike,
    { ...germanLike, approvedTermsCount: 0 },
    { ...germanLike, payoutEligible: false, payableMinor: 0, entryCount: 0 },
    {
      ...base,
      payoutEligible: false,
      accessStatus: "commercial_active",
      authorTermsAccepted: true,
      entryCount: 5,
      payableMinor: 50000,
      approvedTermsCount: 0,
    },
  ]) {
    const code = selectAuthorFinanceEmptyState(scenario);
    const copy = getAuthorFinanceEmptyStateCopy(code);
    assert(
      code !== "not_payout_eligible_free",
      `commercial_active must not resolve to free (got ${code})`,
    );
    assert(
      code !== "terms_missing",
      `commercial_active + Author Terms must not resolve to terms_missing (got ${code})`,
    );
    assert(
      !copy.body.includes("бесплатный"),
      `commercial_active copy must not say free account (got ${code})`,
    );
    assert(
      !copy.body.includes("Действующих коммерческих условий пока нет"),
      `commercial_active copy must not use legacy finance-terms gap copy (got ${code})`,
    );
  }

  const acceptedUi = resolveAuthorFinanceAuthorTermsUi({
    accessStatus: "commercial_active",
    authorTermsAccepted: true,
  });
  assertEqual(
    acceptedUi.badge,
    "Авторские условия приняты",
    "accepted Author Terms badge",
  );
  assert(!acceptedUi.showAcceptCta, "accepted Author Terms need no CTA");
  assert(
    !acceptedUi.body.includes("не согласованы"),
    "accepted Author Terms copy is not the legacy gap message",
  );

  const onboardingUi = resolveAuthorFinanceAuthorTermsUi({
    accessStatus: "commercial_onboarding",
    authorTermsAccepted: false,
  });
  assert(onboardingUi.showAcceptCta, "onboarding without terms shows CTA");
  assert(
    /Авторские условия/.test(onboardingUi.body),
    "onboarding CTA mentions Author Terms",
  );

  assertEqual(
    getAuthorFinanceEmptyStateCopy("author_terms_required").title,
    "Примите Авторские условия",
    "author terms required has dedicated copy",
  );
  assertEqual(
    getAuthorFinanceEmptyStateCopy("commercial_onboarding_incomplete").title,
    "Коммерческое подключение ещё не завершено",
    "onboarding has dedicated copy",
  );
  assertEqual(
    getAuthorFinanceEmptyStateCopy("access_suspended").title,
    "Коммерческий доступ приостановлен",
    "suspended has dedicated copy",
  );
  assertEqual(
    getAuthorFinanceEmptyStateCopy("access_terminated").title,
    "Коммерческий доступ прекращён",
    "terminated has dedicated copy",
  );

  // Ineligibility outranks everything for free authors, including a balance
  // that would otherwise look payable.
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      payoutEligible: false,
      accessStatus: "free",
      payableMinor: 500000,
    }),
    "not_payout_eligible_free",
    "eligibility is asked first for free authors",
  );

  assertEqual(
    selectAuthorFinanceEmptyState({ ...base, approvedTermsCount: 0 }),
    "terms_missing",
    "eligible but no terms",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({ ...base, entryCount: 0 }),
    "no_sales",
    "terms but no sales",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({ ...base, payableMinor: 140000 }),
    "active_ok",
    "above the minimum",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({ ...base, payableMinor: 100000 }),
    "active_ok",
    "exactly the minimum is payable",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({ ...base, payableMinor: 99999 }),
    "below_threshold",
    "one kopek short",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({ ...base, reservedMinor: 140000 }),
    "reserved_in_progress",
    "everything is already in a payout",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({ ...base, heldMinor: 140000 }),
    "held_only",
    "everything is still on hold",
  );
  assertEqual(
    selectAuthorFinanceEmptyState({ ...base, paidPayoutCount: 2 }),
    "has_paid_history",
    "nothing left, but there is a history",
  );

  // Reserved is a stronger explanation than held when both are non-zero: the
  // author is waiting on a transfer, not on a hold window.
  assertEqual(
    selectAuthorFinanceEmptyState({
      ...base,
      reservedMinor: 140000,
      heldMinor: 50000,
    }),
    "reserved_in_progress",
    "a running payout is the more useful answer",
  );

  // Exactly one code, always, and always from the closed set.
  for (const payable of [0, 1, 99999, 100000, 500000]) {
    for (const reserved of [0, 1000]) {
      for (const held of [0, 1000]) {
        for (const paid of [0, 1]) {
          const code = selectAuthorFinanceEmptyState({
            ...base,
            payableMinor: payable,
            reservedMinor: reserved,
            heldMinor: held,
            paidPayoutCount: paid,
          });
          assert(
            AUTHOR_FINANCE_EMPTY_STATE_CODES.includes(code),
            `every combination resolves inside the closed set (got ${code})`,
          );
        }
      }
    }
  }
}

function testThreshold() {
  assertEqual(
    AUTHOR_FINANCE_MINIMUM_PAYOUT_MINOR,
    100000,
    "the minimum is 1000 rubles",
  );
  assert(meetsAuthorPayoutThreshold(100000), "exactly the minimum passes");
  assert(!meetsAuthorPayoutThreshold(99999), "one kopek short does not");
  assert(!meetsAuthorPayoutThreshold(-5000), "a negative balance does not");
}

function testMasking() {
  assertEqual(maskPayoutReference(null), null, "nothing to mask");
  assertEqual(maskPayoutReference("   "), null, "blank is nothing");
  assertEqual(maskPayoutReference("12"), "••", "a short reference is hidden");
  assertEqual(maskPayoutReference("1234"), "••••", "four characters are hidden");
  assertEqual(
    maskPayoutReference("PO-2026-07-000481"),
    "•••0481",
    "a long reference keeps only its tail",
  );

  const raw = "PAYMENT-ORDER-99182734";
  const masked = maskPayoutReference(raw);
  assert(masked !== raw, "the masked value is never the raw value");
  assert(!masked.includes("PAYMENT"), "the operator's numbering is not exposed");
  assert(masked.length < raw.length, "the masked value is shorter");
}

function testCsvGuard() {
  assertThrows(
    () => assertNoForbiddenExportFields(["payment_id"]),
    "payment_id is refused",
  );
  assertThrows(
    () => assertNoForbiddenExportFields(["Payment ID"]),
    "a prettified forbidden name is still refused",
  );
  assertThrows(
    () => assertNoForbiddenExportFields(["external_reference"]),
    "the raw reference is refused",
  );
  assertThrows(
    () => assertNoForbiddenExportFields(["calculation_snapshot"]),
    "the calculation snapshot is refused",
  );

  let error = null;
  try {
    assertNoForbiddenExportFields(["reason_code"]);
  } catch (caught) {
    error = caught;
  }
  assert(
    error instanceof AuthorFinanceExportError,
    "the guard throws its own error type",
  );

  assertNoForbiddenExportFields(["effective_at", "amount_minor", "type_key"]);
}

function testCsvOutput() {
  const ledgerCsv = buildAuthorFinanceLedgerCsv([
    {
      entryId: "11111111-1111-1111-1111-111111111111",
      typeKey: "sale",
      amountMinor: 140000,
      currency: "RUB",
      effectiveAt: "2026-02-10T10:00:00Z",
      availableAt: "2026-02-24T10:00:00Z",
      isHeld: false,
      amountState: "available",
      productTitle: 'Практика "Изобилие", часть 1',
      payoutSafeRef: null,
      publicComment: null,
    },
    {
      entryId: "22222222-2222-2222-2222-222222222222",
      typeKey: "refund",
      amountMinor: -70000,
      currency: "RUB",
      effectiveAt: "2026-03-01T10:00:00Z",
      availableAt: null,
      isHeld: false,
      amountState: "available",
      productTitle: null,
      payoutSafeRef: null,
      publicComment: null,
    },
    {
      entryId: "44444444-4444-4444-4444-444444444444",
      typeKey: "appreciation",
      amountMinor: 7000,
      currency: "RUB",
      effectiveAt: "2026-09-04T03:37:54Z",
      availableAt: "2026-09-18T03:37:54Z",
      isHeld: true,
      amountState: "held",
      productTitle: "Благодарность от слушателя",
      payoutSafeRef: null,
      publicComment: null,
    },
  ]);

  // "Сумма, ₽" contains a comma, so a correct writer must quote it.
  const expectedLedgerHeader = AUTHOR_FINANCE_CSV_COLUMNS.ledger
    .map(escapeCsvCell)
    .join(",");

  const header = ledgerCsv.split("\n")[0];
  assertEqual(
    header,
    expectedLedgerHeader,
    "the ledger export uses the declared Russian columns",
  );
  assert(
    header.includes('"Сумма, ₽"'),
    "a column name containing a comma is quoted",
  );
  assert(ledgerCsv.includes("1400.00"), "kopeks become a plain decimal");
  assert(ledgerCsv.includes("-700.00"), "a reversal keeps its sign");
  assert(
    ledgerCsv.includes('"Практика ""Изобилие"", часть 1"'),
    "a title with a comma and quotes is escaped",
  );
  assert(ledgerCsv.includes("Продажа"), "the type is exported as a Russian label");
  assert(
    !ledgerCsv.includes("sale_accrual"),
    "the raw entry type never reaches the file",
  );
  assert(
    ledgerCsv.includes("Сохраняется"),
    "held amountState exports as Сохраняется",
  );
  assert(
    !ledgerCsv.includes("Удерживается") && !ledgerCsv.includes("На удержании"),
    "ledger CSV has no old hold wording",
  );
  assert(
    ledgerCsv.includes("2026-09-18"),
    "payout availability date is unchanged in CSV",
  );
  assert(ledgerCsv.includes("70.00"), "appreciation 100 ₽ still accrues 70 ₽");

  const payoutsCsv = buildAuthorFinancePayoutsCsv([
    {
      payoutId: "33333333-3333-3333-3333-333333333333",
      statusKey: "paid",
      amountMinor: 140000,
      currency: "RUB",
      periodLabel: "2026-06",
      createdAt: "2026-07-01T00:00:00Z",
      paidAt: "2026-07-03T00:00:00Z",
      referenceMasked: "•••0481",
      isSettled: true,
    },
  ]);

  assertEqual(
    payoutsCsv.split("\n")[0],
    AUTHOR_FINANCE_CSV_COLUMNS.payouts.map(escapeCsvCell).join(","),
    "the payout export uses the declared Russian columns",
  );
  assert(payoutsCsv.includes("•••0481"), "only the masked reference is exported");
  assert(payoutsCsv.includes("Выплачено"), "the status is a Russian label");

  // The forbidden vocabulary must not appear anywhere in either file, in any
  // casing, including inside a header.
  for (const field of AUTHOR_FINANCE_FORBIDDEN_FIELDS) {
    assert(
      !ledgerCsv.toLowerCase().includes(field),
      `the ledger export never contains "${field}"`,
    );
    assert(
      !payoutsCsv.toLowerCase().includes(field),
      `the payout export never contains "${field}"`,
    );
  }

  assertEqual(formatMinorForCsv(0), "0.00", "zero");
  assertEqual(formatMinorForCsv(5), "0.05", "five kopeks");
  assertEqual(formatMinorForCsv(-1), "-0.01", "one negative kopek");

  assert(isAuthorFinanceExportKind("ledger"), "ledger is an export kind");
  assert(isAuthorFinanceExportKind("payouts"), "payouts is an export kind");
  assert(!isAuthorFinanceExportKind("terms"), "nothing else is");
  assert(
    buildAuthorFinanceExportFilename("ledger", new Date("2026-07-27T09:00:00Z"))
      === "audiolad-finance-ledger-2026-07-27.csv",
    "the filename carries the kind and the date",
  );
}

function testPeriodResolution() {
  const now = new Date("2026-07-27T09:00:00Z");

  const all = resolveAuthorFinancePeriodRange("all", { now });
  assertEqual(all.from, null, "all time has no lower bound");
  assertEqual(all.to, null, "all time has no upper bound");

  const year = resolveAuthorFinancePeriodRange("year", { now });
  assertEqual(year.from, "2026-01-01T00:00:00.000Z", "the current year starts");
  assertEqual(year.to, "2027-01-01T00:00:00.000Z", "and ends half-open");

  const prev = resolveAuthorFinancePeriodRange("prev_year", { now });
  assertEqual(prev.from, "2025-01-01T00:00:00.000Z", "the previous year starts");
  assertEqual(prev.to, "2026-01-01T00:00:00.000Z", "and meets the current one");

  // Half-open bounds mean a row on the boundary belongs to exactly one period.
  assertEqual(prev.to, year.from, "the two years do not overlap");

  const custom = resolveAuthorFinancePeriodRange("custom", {
    now,
    from: "2026-03-01",
    to: "2026-03-31",
  });
  assertEqual(custom.from, "2026-03-01T00:00:00.000Z", "a bare date starts the day");
  assertEqual(
    custom.to,
    "2026-04-01T00:00:00.000Z",
    "and the end date includes its whole day",
  );

  const inverted = resolveAuthorFinancePeriodRange("custom", {
    now,
    from: "2026-05-01",
    to: "2026-03-01",
  });
  assertEqual(inverted.period, "all", "an inverted range falls back to all time");

  const empty = resolveAuthorFinancePeriodRange("custom", { now });
  assertEqual(empty.period, "all", "an empty custom range is all time");

  const openEnded = resolveAuthorFinancePeriodRange("custom", {
    now,
    from: "2026-03-01",
  });
  assertEqual(openEnded.period, "custom", "one bound is enough");
  assertEqual(openEnded.to, null, "the other stays open");
}

/**
 * The vocabulary exists twice — once in SQL, once here. These checks fail the
 * build if the two copies drift.
 */
const FORBIDDEN_FINANCE_COPY = [
  "Удерживается",
  "удерживается",
  "Деньги на удержании",
  "Срок удержания",
  "период удержания",
  "Ближайшее освобождение",
  "Ваша доля со всех продаж",
  "На удержании",
  "на удержании",
  "Что такое удержание",
  "Удержано",
  "Удержанные",
];

const FINANCE_UI_SCAN_ROOTS = [
  "src/lib/author-finance",
  "src/lib/author-sales",
  "src/lib/admin/analytics-author-finance-dictionary.ts",
  "src/components/author-dashboard/AuthorFinanceClient.tsx",
  "src/components/author-dashboard/AuthorAppreciationSection.tsx",
  "src/components/author-dashboard/AuthorSalesSection.tsx",
  "src/components/admin/AdminAuthorEconomyPanel.tsx",
  "src/components/admin/AdminAuthorPayoutsPanel.tsx",
];

function listSourceFiles(relativePath) {
  const absolute = join(ROOT, relativePath);
  const stat = statSync(absolute);
  if (stat.isFile()) return [relativePath];
  const found = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const next = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...listSourceFiles(next));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) found.push(next);
  }
  return found;
}

function testHeldCopyAndTechnicalSemantics() {
  const hits = [];
  for (const root of FINANCE_UI_SCAN_ROOTS) {
    for (const file of listSourceFiles(root)) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const phrase of FORBIDDEN_FINANCE_COPY) {
        if (source.includes(phrase)) {
          hits.push(`${file}: ${phrase}`);
        }
      }
      if (/(?<![A-Za-z_])удерж/i.test(source)) {
        hits.push(`${file}: удерж…`);
      }
    }
  }
  assertEqual(hits.length, 0, `user-facing удерж copy remaining: ${hits.join("; ")}`);

  const globalForbidden = [
    "Удерживается",
    "удерживается",
    "Деньги на удержании",
    "Срок удержания",
    "период удержания",
    "Ближайшее освобождение",
    "Ваша доля со всех продаж",
  ];
  const globalHits = [];
  for (const file of listSourceFiles("src")) {
    if (file.includes("/seo/")) continue;
    if (file.includes("/author-terms/approved-content")) continue;
    if (file.includes("AuthorPayoutProfileForm")) continue;
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const phrase of globalForbidden) {
      if (source.includes(phrase)) globalHits.push(`${file}: ${phrase}`);
    }
  }
  assertEqual(
    globalHits.length,
    0,
    `global forbidden finance copy remaining: ${globalHits.join("; ")}`,
  );

  const client = readFileSync(
    join(ROOT, "src/components/author-dashboard/AuthorFinanceClient.tsx"),
    "utf8",
  );
  assert(
    client.includes("AUTHOR_FINANCE_NEXT_AVAILABLE_PREFIX"),
    "nearest release uses the new prefix",
  );
  assert(
    !client.includes("Ближайшее освобождение"),
    "old nearest-release copy is gone",
  );
  assert(
    client.includes("AUTHOR_FINANCE_HOLD_DAYS_LABEL"),
    "terms card uses Срок до доступности",
  );
  assert(
    client.includes("summary.nextHoldReleaseAt"),
    "availableAt-driven nearest date is unchanged",
  );

  const types = readFileSync(
    join(ROOT, "src/lib/author-finance/types.ts"),
    "utf8",
  );
  assert(types.includes('"held"'), "technical amount state held remains");
  assert(
    client.includes("row.amountState") &&
      client.includes("getAuthorFinanceAmountStateLabel"),
    "UI still maps amountState through the label helper",
  );
}

function testSourceContracts() {
  const sql = [MIGRATION, EMPTY_STATE_MIGRATION, AUTHOR_TERMS_EMPTY_STATE_MIGRATION]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const baseSql = readFileSync(MIGRATION, "utf8");

  for (const key of AUTHOR_FINANCE_TYPE_KEYS) {
    assert(sql.includes(`'${key}'`), `the SQL knows the type key ${key}`);
  }
  for (const state of AUTHOR_FINANCE_AMOUNT_STATES) {
    assert(sql.includes(`'${state}'`), `the SQL knows the amount state ${state}`);
  }
  for (const key of AUTHOR_FINANCE_PAYOUT_STATUS_KEYS) {
    assert(sql.includes(`'${key}'`), `the SQL knows the payout status ${key}`);
  }
  for (const code of AUTHOR_FINANCE_EMPTY_STATE_CODES) {
    assert(sql.includes(`'${code}'`), `the SQL knows the empty state ${code}`);
  }
  for (const status of AUTHOR_FINANCE_INTEGRITY_STATUSES) {
    assert(sql.includes(`'${status}'`), `the SQL knows the integrity status ${status}`);
  }

  // P3.3.4 is a read-only phase. Nothing in the base migration may write.
  for (const statement of [
    "CREATE TABLE",
    "INSERT INTO",
    "UPDATE public.",
    "DELETE FROM",
    "ALTER TABLE",
    "TRUNCATE",
    "DROP TABLE",
  ]) {
    assert(
      !baseSql.toUpperCase().includes(statement),
      `the migration contains no ${statement}`,
    );
  }

  // Every author-facing RPC is locked to service_role.
  for (const fn of [
    "author_finance_p334_summary",
    "author_finance_p334_terms",
    "author_finance_p334_ledger",
    "author_finance_p334_ledger_detail",
    "author_finance_p334_payouts",
    "author_finance_p334_payout_detail",
    "author_finance_p334_integrity_status",
    "author_finance_p334_entries",
  ]) {
    assert(sql.includes(`public.${fn}`), `the migration defines ${fn}`);
    assert(
      sql.includes(`REVOKE ALL ON FUNCTION public.${fn}`),
      `${fn} revokes the default grants`,
    );
  }

  assert(
    sql.includes("SET search_path = public, pg_temp"),
    "SECURITY DEFINER functions pin their search_path",
  );

  // The summary reconciles instead of recomputing.
  assert(
    sql.includes("public.author_finance_balance(p_author_id"),
    "the summary reads the P3.3.2 balance",
  );
  assert(
    sql.includes("public.author_payout_payable_snapshot("),
    "the summary reads the P3.3.3 payable snapshot",
  );
  assert(
    sql.includes("public.author_finance_p334_select_empty_state("),
    "summary empty state goes through the shared selector",
  );
  assert(
    sql.includes("IS DISTINCT FROM 'commercial_active'"),
    "SQL keeps commercial_active out of the free-account branch",
  );

  // No period argument on the summary: a balance is never period-bound.
  const summarySignature = sql.slice(
    sql.indexOf("FUNCTION public.author_finance_p334_summary("),
    sql.indexOf("RETURNS jsonb", sql.indexOf("FUNCTION public.author_finance_p334_summary(")),
  );
  assert(
    !summarySignature.includes("timestamptz"),
    "the summary takes no period argument",
  );

  const queries = readFileSync(
    join(ROOT, "src/lib/author-finance/queries.ts"),
    "utf8",
  );
  assert(
    queries.includes("selectAuthorFinanceEmptyState("),
    "the app remaps empty_state_code from access/balance fields",
  );
  assert(
    queries.includes("p_author_id: input.authorId"),
    "finance RPCs always receive the verified author id",
  );

  const guard = readFileSync(
    join(ROOT, "src/lib/author-finance/route-guard.ts"),
    "utf8",
  );
  assert(
    guard.includes("requireAuthorMembership(claimed)"),
    "finance routes prove membership for the claimed author_id",
  );
  assert(
    guard.includes("authorId: claimed"),
    "only the verified claim reaches finance resolvers",
  );

  for (const route of [
    "src/app/api/author/finance/summary/route.ts",
    "src/app/api/author/finance/terms/route.ts",
    "src/app/api/author/finance/ledger/route.ts",
    "src/app/api/author/finance/payouts/route.ts",
    "src/app/api/author/finance/export/route.ts",
  ]) {
    const src = readFileSync(join(ROOT, route), "utf8");
    assert(
      src.includes("requireAuthorFinanceAccess") ||
        src.includes("createAuthorFinanceExportHandler"),
      `${route} gates on the selected author_id`,
    );
  }

  const client = readFileSync(
    join(ROOT, "src/components/author-dashboard/AuthorFinanceClient.tsx"),
    "utf8",
  );
  assert(
    client.includes("author_id=${encodeURIComponent(selectedAuthor.id)}"),
    "the finance client always sends the selected author id",
  );

  const banner = readFileSync(
    join(ROOT, "src/lib/author-finance/payout-profile-banner.ts"),
    "utf8",
  );
  assert(
    banner.includes("shouldShowFinancePayoutProfileBanner"),
    "payout profile absence has its own banner helper",
  );
  assert(
    !banner.includes("selectAuthorFinanceEmptyState"),
    "payout profile banner does not drive commercial-access empty state",
  );
}

function main() {
  testLabelsAreComplete();
  testHeldCopyAndTechnicalSemantics();
  testPublicSafeMessages();
  testTypeAndStatusMapping();
  testEmptyStateMatrix();
  testThreshold();
  testMasking();
  testCsvGuard();
  testCsvOutput();
  testPeriodResolution();
  testSourceContracts();

  console.log("payments-p334-author-finance-unit: ok");
}

main();
