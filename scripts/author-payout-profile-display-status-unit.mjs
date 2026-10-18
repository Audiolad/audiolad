// Task 34c55245: the author cabinet must show the real payout profile state.
// «не заполнены» only when there is no profile; draft / submitted / in_review /
// verified / needs_changes / load errors get their own copy; status is scoped
// per author workspace (incl. support mode). Synthetic ids only, no requisites.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

process.env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID = "test-key";
process.env.PAYOUT_PROFILES_ENABLED = "true";

const NOT_FILLED = /не заполнен/i;
const EM_DASH = /\u2014/;

const AUTHOR_A = "00000000-0000-4000-8000-00000000000a";
const AUTHOR_B = "00000000-0000-4000-8000-00000000000b";
const AUTHOR_C = "00000000-0000-4000-8000-00000000000c";
const AUTHOR_DB_ERROR = "00000000-0000-4000-8000-0000000000ee";
const AUTHOR_FORBIDDEN = "00000000-0000-4000-8000-0000000000ff";
const OWNER_USER = "00000000-0000-4000-8000-000000000001";
const SUPPORT_USER = "00000000-0000-4000-8000-000000000099";

function row(authorId, status, extra = {}) {
  return {
    id: `profile-${authorId.slice(-2)}`,
    author_id: authorId,
    recipient_type: "self_employed",
    status,
    version: 1,
    encrypted_payload: null,
    payout_method: null,
    bank_display_name: null,
    inn_last4: null,
    account_last4: null,
    is_npd_declared: false,
    npd_status_checked_at: null,
    npd_status_check_result: null,
    review_comment: null,
    staff_note: null,
    author_revision_comment: null,
    reviewed_by: null,
    submitted_at: null,
    review_started_at: null,
    verified_at: null,
    rejected_at: null,
    created_at: "2026-10-18T10:00:00Z",
    updated_at: "2026-10-18T10:00:00Z",
    ...extra,
  };
}

// Synthetic "masked" draft: only presence markers, no full requisites.
const MASKED_DRAFT = row(AUTHOR_A, "draft", {
  payout_method: "card",
  account_last4: "0000",
  bank_display_name: "Тестовый банк",
});
const rowsByAuthor = new Map([
  [AUTHOR_A, MASKED_DRAFT],
  [AUTHOR_B, row(AUTHOR_B, "verified", { payout_method: "card", account_last4: "0000" })],
  // AUTHOR_C: no profile.
]);

function fakeSupabase() {
  return {
    from(table) {
      assert.equal(table, "author_payout_profiles");
      let authorId = null;
      const b = {
        select() { return b; },
        eq(column, value) {
          if (column === "author_id") authorId = value;
          return b;
        },
        maybeSingle() { return b; },
        then(resolve, reject) {
          const res =
            authorId === AUTHOR_DB_ERROR
              ? { data: null, error: { code: "XX000", message: "synthetic" } }
              : { data: rowsByAuthor.get(authorId) ?? null, error: null };
          return Promise.resolve(res).then(resolve, reject);
        },
      };
      return b;
    },
  };
}

let supportMode = null; // { actingAuthorId }
const mocks = {
  "@/lib/author-products/auth": {
    requireAuthorMembership: async (authorId) => {
      if (authorId === AUTHOR_FORBIDDEN) {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      }
      if (supportMode && supportMode.actingAuthorId !== authorId) {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      }
      return { user: { id: supportMode ? SUPPORT_USER : OWNER_USER }, role: "owner" };
    },
    handleAuthorRouteError: (error) =>
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: error?.status ?? 500,
      }),
  },
  "@/lib/author-terms/guard": { requireCurrentAuthorTermsAcceptance: async () => {} },
  "@/lib/author-support/audit": { recordAuthorSupportAudit: async () => {} },
  "@/lib/supabase/service-role": { createServiceRoleClient: () => fakeSupabase() },
};
const Module = createRequire(import.meta.url)("node:module");
const originalLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === "server-only") return {};
  if (mocks[request]) return mocks[request];
  return originalLoad.call(this, request, ...rest);
};

const {
  payoutProfileStatusSourceFromApi,
  payoutProfileStatusSourceFromRow,
  resolvePayoutProfileDisplayState,
  selectPayoutProfileSourceForWorkspace,
  PAYOUT_PROFILE_DRAFT_STATUS_LABEL,
} = await import("../src/lib/author-payout-profiles/display-status.ts");
const {
  resolveFinancePayoutProfileBanner,
  shouldShowFinancePayoutProfileBanner,
} = await import("../src/lib/author-finance/payout-profile-banner.ts");
const { resolveAuthorStatusView } = await import(
  "../src/lib/author-dashboard/author-status.ts"
);
const route = await import("../src/app/api/author/payout-profile/route.ts");

const origError = console.error;
const logs = [];
console.error = (...a) => logs.push(a.join(" "));

function visibleText(state) {
  return [state.title, state.statusLabel, state.description, state.ctaLabel]
    .filter(Boolean)
    .join(" | ");
}

async function cabinetStateFor(authorId) {
  const response = await route.GET(
    new Request(`http://localhost/api/author/payout-profile?author_id=${authorId}`),
  );
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (response.ok) {
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  const source = payoutProfileStatusSourceFromApi({ ok: response.ok, payload });
  return { source, state: resolveFinancePayoutProfileBanner(source), text };
}

// 1. No profile -> the only state allowed to say «не заполнены».
{
  const { source, state } = await cabinetStateFor(AUTHOR_C);
  assert.deepEqual(source, { kind: "loaded", status: null });
  assert.equal(state.kind, "missing");
  assert.equal(state.showFinanceBanner, true);
  assert.match(state.description, NOT_FILLED);
  assert.equal(state.ctaLabel, "Заполнить реквизиты");
}

// 2. Draft with masked details -> «Черновик сохранён – завершите оформление».
{
  const { source, state, text } = await cabinetStateFor(AUTHOR_A);
  assert.deepEqual(source, { kind: "loaded", status: "draft" });
  assert.equal(state.kind, "draft");
  assert.equal(state.statusLabel, "Черновик сохранён – завершите оформление");
  assert.equal(state.statusLabel, PAYOUT_PROFILE_DRAFT_STATUS_LABEL);
  assert.doesNotMatch(visibleText(state), NOT_FILLED);
  assert.equal(state.ctaLabel, "Продолжить оформление");
  // Only presence / masked markers reach the browser.
  assert.doesNotMatch(text, /encrypted_payload|staff_note/);
}

// 3-6. submitted / in_review / verified / needs_changes (+ rejected).
const expectations = {
  submitted: { kind: "submitted", banner: true, label: "Отправлены на проверку" },
  in_review: { kind: "in_review", banner: true, label: "На проверке" },
  verified: { kind: "verified", banner: false, label: "Подтверждены" },
  needs_changes: { kind: "needs_changes", banner: true, label: "Требуется уточнение" },
  rejected: { kind: "rejected", banner: true, label: "Требуется уточнение" },
};
for (const [status, expected] of Object.entries(expectations)) {
  rowsByAuthor.set(AUTHOR_C, row(AUTHOR_C, status, { account_last4: "0000" }));
  const { source, state } = await cabinetStateFor(AUTHOR_C);
  assert.deepEqual(source, { kind: "loaded", status }, status);
  assert.equal(state.kind, expected.kind, status);
  assert.equal(state.showFinanceBanner, expected.banner, status);
  assert.equal(state.statusLabel, expected.label, status);
  assert.doesNotMatch(visibleText(state), NOT_FILLED, status);
}
rowsByAuthor.delete(AUTHOR_C);

// 7. Load errors never read as «не заполнены».
{
  const dbError = await cabinetStateFor(AUTHOR_DB_ERROR);
  assert.deepEqual(dbError.source, { kind: "error" });
  assert.equal(dbError.state.kind, "unavailable");
  assert.doesNotMatch(visibleText(dbError.state), NOT_FILLED);
  assert.doesNotMatch(dbError.text, /synthetic|XX000/);

  const forbidden = await cabinetStateFor(AUTHOR_FORBIDDEN);
  assert.deepEqual(forbidden.source, { kind: "error" });
  assert.doesNotMatch(visibleText(forbidden.state), NOT_FILLED);

  for (const bad of [
    { ok: false, payload: null },
    { ok: true, payload: null },
    { ok: true, payload: "oops" },
    { ok: true, payload: { profile: null } },
    { ok: true, payload: { featureEnabled: true } },
    { ok: true, payload: { featureEnabled: true, profile: { status: "archived" } } },
    { ok: true, payload: { featureEnabled: true, profile: {} } },
  ]) {
    const source = payoutProfileStatusSourceFromApi(bad);
    assert.deepEqual(source, { kind: "error" }, JSON.stringify(bad));
    const state = resolvePayoutProfileDisplayState(source);
    assert.equal(state.kind, "unavailable");
    assert.doesNotMatch(visibleText(state), NOT_FILLED);
  }

  // Unknown status passed directly is also "unavailable".
  const unknown = resolvePayoutProfileDisplayState({ kind: "loaded", status: "weird" });
  assert.equal(unknown.kind, "unavailable");

  assert.deepEqual(
    payoutProfileStatusSourceFromApi({ ok: true, payload: { featureEnabled: false, profile: null } }),
    { kind: "feature_disabled" },
  );
  assert.equal(resolvePayoutProfileDisplayState({ kind: "feature_disabled" }).showFinanceBanner, false);
  assert.equal(resolvePayoutProfileDisplayState({ kind: "loading" }).showFinanceBanner, false);

  // Server-side row normalizer used by the status page.
  assert.deepEqual(payoutProfileStatusSourceFromRow({ error: { code: "x" }, row: null }), { kind: "error" });
  assert.deepEqual(payoutProfileStatusSourceFromRow({ error: null, row: null }), { kind: "loaded", status: null });
  assert.deepEqual(payoutProfileStatusSourceFromRow({ error: null, row: { status: "draft" } }), { kind: "loaded", status: "draft" });
  assert.deepEqual(payoutProfileStatusSourceFromRow({ error: null, row: { status: "nope" } }), { kind: "error" });
}

// 8. Several author workspaces: each status is scoped to its author_id and a
// status loaded for one workspace is never shown for another.
{
  const a = await cabinetStateFor(AUTHOR_A);
  const b = await cabinetStateFor(AUTHOR_B);
  const c = await cabinetStateFor(AUTHOR_C);
  assert.equal(a.state.kind, "draft");
  assert.equal(b.state.kind, "verified");
  assert.equal(c.state.kind, "missing");

  const loadedForA = { authorId: AUTHOR_A, source: a.source };
  assert.deepEqual(selectPayoutProfileSourceForWorkspace(loadedForA, AUTHOR_A), a.source);
  // Switched to B before B's status arrived -> loading, not A's draft and not «не заполнены».
  const switched = selectPayoutProfileSourceForWorkspace(loadedForA, AUTHOR_B);
  assert.deepEqual(switched, { kind: "loading" });
  assert.equal(resolvePayoutProfileDisplayState(switched).showFinanceBanner, false);
  assert.deepEqual(
    selectPayoutProfileSourceForWorkspace({ authorId: null, source: { kind: "loading" } }, null),
    { kind: "loading" },
  );
}

// 9. Support mode: the acting staff member sees the real status of the
// supported author; another author's status is an error, never «не заполнены».
{
  supportMode = { actingAuthorId: AUTHOR_A };
  const own = await cabinetStateFor(AUTHOR_A);
  assert.equal(own.state.kind, "draft");
  assert.equal(own.state.statusLabel, PAYOUT_PROFILE_DRAFT_STATUS_LABEL);
  const other = await cabinetStateFor(AUTHOR_B);
  assert.equal(other.state.kind, "unavailable");
  assert.doesNotMatch(visibleText(other.state), NOT_FILLED);
  supportMode = null;
}

// 10. Status page optional payout card uses the same resolver.
{
  const base = {
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    termsAccepted: true,
    publishedTermsAvailable: true,
    role: "owner",
    authorSlug: "synthetic-author",
    hasPublishedFreeProduct: true,
  };
  const draft = resolveAuthorStatusView({ ...base, payoutProfileStatus: "draft" });
  assert.equal(draft.optionalPayout?.statusLabel, PAYOUT_PROFILE_DRAFT_STATUS_LABEL);
  assert.equal(draft.optionalPayout?.cta.label, "Продолжить заполнение реквизитов");

  const failed = resolveAuthorStatusView({
    ...base,
    payoutProfileStatus: null,
    payoutProfileLoadFailed: true,
  });
  assert.ok(failed.optionalPayout);
  assert.equal(failed.optionalPayout.cta.label, "Открыть данные для выплат");
  assert.doesNotMatch(
    [failed.optionalPayout.statusLabel, failed.optionalPayout.description, failed.optionalPayout.cta.label].join(" "),
    NOT_FILLED,
  );
  assert.notEqual(failed.optionalPayout.cta.label, "Заполнить реквизиты");

  const editorFailed = resolveAuthorStatusView({
    ...base,
    role: "editor",
    payoutProfileStatus: null,
    payoutProfileLoadFailed: true,
  });
  assert.equal(editorFailed.optionalPayout?.cta.disabled, true);
  assert.equal(editorFailed.optionalPayout?.cta.href, null);

  const missing = resolveAuthorStatusView({ ...base, payoutProfileStatus: null });
  assert.equal(missing.optionalPayout?.cta.label, "Заполнить реквизиты");
  const verified = resolveAuthorStatusView({ ...base, payoutProfileStatus: "verified" });
  assert.equal(verified.optionalPayout?.statusLabel, "Подтверждены");
}

// 11. Legacy boolean helper keeps its contract (no profile -> banner).
assert.equal(shouldShowFinancePayoutProfileBanner({ featureEnabled: true, payoutProfileStatus: null }), true);
assert.equal(shouldShowFinancePayoutProfileBanner({ featureEnabled: true, payoutProfileStatus: "verified" }), false);

// 12. En dash only in visible copy; finance client wiring (per workspace,
// no-store, refresh when returning to the page).
{
  const files = [
    "src/lib/author-payout-profiles/display-status.ts",
    "src/lib/author-finance/payout-profile-banner.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), EM_DASH, file);
  }
  for (const status of [null, ...Object.keys(expectations), "draft"]) {
    assert.doesNotMatch(
      visibleText(resolvePayoutProfileDisplayState({ kind: "loaded", status })),
      EM_DASH,
    );
  }
  assert.doesNotMatch(visibleText(resolvePayoutProfileDisplayState({ kind: "error" })), EM_DASH);

  const client = readFileSync("src/components/author-dashboard/AuthorFinanceClient.tsx", "utf8");
  assert.match(client, /resolveFinancePayoutProfileBanner/);
  assert.match(client, /payoutProfileStatusSourceFromApi/);
  assert.match(client, /selectPayoutProfileSourceForWorkspace\(payoutProfileState, selectedAuthor\.id\)/);
  assert.match(client, /\/api\/author\/payout-profile\?author_id=/);
  assert.match(client, /cache: "no-store"/);
  assert.match(client, /visibilitychange/);
  assert.match(client, /pageshow/);
  assert.doesNotMatch(client, /AUTHOR_FINANCE_PAYOUT_PROFILE_MISSING_COPY/);

  const loader = readFileSync("src/lib/author-dashboard/load-author-status.ts", "utf8");
  assert.match(loader, /payoutProfileLoadFailed: payout\.loadFailed/);
}

// No requisites or raw DB error details logged.
for (const line of logs) {
  assert.doesNotMatch(line, /synthetic|0000|Тестовый банк/, line);
}
console.error = origError;
console.log("author-payout-profile-display-status-unit: ok");
