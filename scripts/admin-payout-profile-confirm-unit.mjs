// Regression: admin «Данные для выплат» – «Подтвердить» looked like it did
// nothing. The DB write succeeded (status = verified), but the admin screen
// reused the author-facing labels (verified → «Данные заполнены»,
// needs_changes and rejected → «Требуется уточнение»), so the list never
// showed a confirmed state and the filter row had a duplicate chip and no
// «Подтверждены». Also: confirmation of incomplete requisites must fail with
// an explicit red error instead of a fake success.
// Synthetic data only (fake card/INN/phone), in-memory Supabase fake.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID = "test-key";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const adminStatus = await import("../src/lib/author-payout-profiles/admin-status.ts");
const {
  ADMIN_PAYOUT_PROFILE_FILTERS,
  describeStaffPayoutTransitionError,
  findPayoutProfileVerifyBlockers,
  formatPayoutProfileVerifyBlockedMessage,
  getAdminPayoutProfileStatusLabel,
  getAdminPayoutProfileStatusTone,
  payoutBankNameLooksInvalid,
  resolveAdminPayoutProfileFilter,
} = adminStatus;
const { AUTHOR_PAYOUT_PROFILE_STATUSES, getAuthorPayoutProfileStatusLabel } =
  await import("../src/lib/author-payout-profiles/types.ts");
const {
  AuthorPayoutProfileError,
  getAdminPayoutProfileDetail,
  listAdminPayoutProfiles,
  staffTransitionPayoutProfile,
  submitAuthorPayoutProfile,
} = await import("../src/lib/author-payout-profiles/service.ts");

// 1. Admin labels: verified is shown as confirmed; every non-draft status
//    has its own label (author-facing labels stay simplified on purpose).
{
  assert.equal(getAdminPayoutProfileStatusLabel("verified"), "Данные подтверждены");
  assert.equal(getAdminPayoutProfileStatusTone("verified"), "success");
  const nonDraft = AUTHOR_PAYOUT_PROFILE_STATUSES.filter((s) => s !== "draft");
  const labels = nonDraft.map((s) => getAdminPayoutProfileStatusLabel(s));
  assert.equal(new Set(labels).size, labels.length, `duplicate admin labels: ${labels}`);
  assert.notEqual(getAdminPayoutProfileStatusLabel("verified"), "Данные заполнены");
  // Author cabinet keeps its simplified wording.
  assert.equal(getAuthorPayoutProfileStatusLabel("verified"), "Данные заполнены");
}

// 2. Filter chips: unique labels, unique keys, a «Подтверждены» chip, every
//    non-draft status reachable, unknown/draft values fall back to «Все».
{
  const keys = ADMIN_PAYOUT_PROFILE_FILTERS.map((f) => f.key);
  const labels = ADMIN_PAYOUT_PROFILE_FILTERS.map((f) => f.label);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(labels).size, labels.length, `duplicate chips: ${labels}`);
  assert.equal(labels.filter((l) => l === "Требуется уточнение").length, 1);
  assert.equal(ADMIN_PAYOUT_PROFILE_FILTERS.find((f) => f.key === "verified")?.label, "Подтверждены");
  for (const status of AUTHOR_PAYOUT_PROFILE_STATUSES.filter((s) => s !== "draft")) {
    assert.ok(keys.includes(status), `missing chip for ${status}`);
    assert.equal(resolveAdminPayoutProfileFilter(status), status);
  }
  assert.equal(resolveAdminPayoutProfileFilter(undefined), "all");
  assert.equal(resolveAdminPayoutProfileFilter("draft"), "all");
  assert.equal(resolveAdminPayoutProfileFilter("verified'--"), "all");
}

// 3. Admin screens must not use the author-facing label helper; dates are
//    rendered in Moscow time; the warning uses an en dash.
{
  for (const file of [
    "src/components/admin/PayoutProfilesList.tsx",
    "src/components/admin/PayoutProfileReviewForm.tsx",
    "src/app/(platform)/admin/payout-profiles/page.tsx",
    "src/app/(platform)/admin/payout-profiles/[id]/page.tsx",
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /getAuthorPayoutProfileStatusLabel/, file);
  }
  for (const file of [
    "src/components/admin/PayoutProfilesList.tsx",
    "src/components/admin/PayoutProfileReviewForm.tsx",
  ]) {
    assert.match(read(file), /timeZone: "Europe\/Moscow"/, file);
  }
  const form = read("src/components/admin/PayoutProfileReviewForm.tsx");
  assert.match(form, /комментарии – используйте общие формулировки/);
  assert.doesNotMatch(form, /комментарии \u2014 используйте/);
  assert.match(form, /data-payout-decision="verified"/);
  const actions = read("src/app/(platform)/admin/payout-profiles/actions.ts");
  assert.doesNotMatch(actions, /не найден \u2014 письмо/);
}

// 4. Verify blockers (field names only, never values).
{
  const fields = {
    payout_method: "sbp",
    legal_name: null,
    first_name: "Тест",
    last_name: "Тестов",
    middle_name: null,
    inn: null,
    ogrnip: null,
    email: "synthetic@example.test",
    phone: "+7 (900) 000-00-01",
    card_number: null,
    bank_account: null,
    bank_bik: null,
    bank_name: "Тест-Банк",
    bank_correspondent_account: null,
    registration_address: null,
    tax_residency_note: null,
  };
  assert.deepEqual(
    findPayoutProfileVerifyBlockers({ recipientType: "individual", payoutMethod: "sbp", fields }),
    [],
  );
  const phoneAsBank = findPayoutProfileVerifyBlockers({
    recipientType: "individual",
    payoutMethod: "sbp",
    fields: { ...fields, bank_name: "+7 900 000-00-02" },
  });
  assert.equal(phoneAsBank.length, 1);
  assert.match(phoneAsBank[0], /Банк/);
  assert.doesNotMatch(phoneAsBank.join(" "), /\d{3}/);
  assert.ok(payoutBankNameLooksInvalid("89000000002"));
  assert.ok(!payoutBankNameLooksInvalid("Т-Банк"));
  assert.ok(!payoutBankNameLooksInvalid(""));

  const account = findPayoutProfileVerifyBlockers({
    recipientType: "individual",
    payoutMethod: "bank_account",
    fields: { ...fields, payout_method: "bank_account" },
  });
  assert.deepEqual(account, ["не указан БИК", "не указан расчётный счёт"]);
  const msg = formatPayoutProfileVerifyBlockedMessage(account);
  assert.match(msg, /^Данные нельзя подтвердить: не указан БИК; не указан расчётный счёт\./);
  assert.doesNotMatch(msg, /\u2014/);

  assert.deepEqual(
    findPayoutProfileVerifyBlockers({ recipientType: "individual", payoutMethod: null, fields: { ...fields, payout_method: null } }),
    ["не выбран способ получения выплаты"],
  );
  assert.ok(
    findPayoutProfileVerifyBlockers({ recipientType: "self_employed", payoutMethod: "sbp", fields }).some((b) => /ИНН/.test(b)),
  );
  assert.ok(findPayoutProfileVerifyBlockers({ recipientType: "individual", payoutMethod: "card", fields }).includes("не указан номер карты"));
  assert.match(describeStaffPayoutTransitionError("conflict"), /Обновите страницу/);
  assert.equal(describeStaffPayoutTransitionError(null), "Не удалось обновить статус анкеты.");
}

// 5. Service: confirm persists verified (+ who/when); blocked confirm leaves
//    the row untouched and throws verify_blocked.
function createFakeSupabase() {
  const tables = {
    author_payout_profiles: [],
    author_payout_profile_status_events: [],
    profiles: [{ id: "00000000-0000-4000-8000-0000000000aa", full_name: "Сотрудник Тест", email: "staff@example.test" }],
  };
  let seq = 0;
  return {
    tables,
    from(table) {
      const rows = tables[table];
      let op = "select";
      let payload = {};
      const conds = [];
      const inConds = [];
      const matches = () =>
        rows.filter(
          (r) => conds.every(([k, v]) => r[k] === v) && inConds.every(([k, vs]) => vs.includes(r[k])),
        );
      let many = true;
      const builder = {
        insert(p) { op = "insert"; payload = p; many = false; return builder; },
        update(p) { op = "update"; payload = p; many = false; return builder; },
        select() { return builder; },
        eq(k, v) { conds.push([k, v]); return builder; },
        in(k, vs) { inConds.push([k, vs]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        single() { many = false; return builder; },
        maybeSingle() { many = false; return builder; },
        then(resolve, reject) {
          let data = null;
          if (op === "insert") {
            data = { id: `id-${++seq}`, created_at: "2026-10-18T10:37:48.000Z", updated_at: "2026-10-18T10:37:48.000Z", review_comment: null, staff_note: null, reviewed_by: null, submitted_at: null, review_started_at: null, verified_at: null, rejected_at: null, authors: { name: "Синтетический автор", slug: "synthetic" }, ...payload };
            rows.push(data);
          } else if (op === "update") {
            data = matches()[0] ?? null;
            if (data) Object.assign(data, payload, { updated_at: new Date().toISOString() });
          } else {
            data = many ? matches() : matches()[0] ?? null;
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const staff = "00000000-0000-4000-8000-0000000000aa";
const author = "00000000-0000-4000-8000-000000000002";
const base = {
  recipient_type: "individual",
  payout_method: "sbp",
  first_name: "Тест",
  last_name: "Тестов",
  email: "synthetic@example.test",
  phone: "+7 (900) 000-00-01",
  bank_name: "Тест-Банк",
  details_confirmed: true,
};

{
  const db = createFakeSupabase();
  const { profile } = await submitAuthorPayoutProfile({ supabase: db, authorId: author, actorUserId: author, body: { ...base, author_id: author } });
  assert.equal(profile.status, "submitted");

  const before = await getAdminPayoutProfileDetail(db, profile.id);
  assert.deepEqual(before.verify_blockers, []);
  assert.equal(before.reviewed_by_name, null);

  const result = await staffTransitionPayoutProfile({ supabase: db, profileId: profile.id, actorUserId: staff, toStatus: "verified" });
  assert.equal(result.transitioned, true);
  assert.equal(result.detail.status, "verified");
  assert.ok(result.detail.verified_at);
  assert.equal(result.detail.reviewed_by, staff);
  assert.equal(result.detail.reviewed_by_name, "Сотрудник Тест");

  // Reopen: still verified, list shows it under the «Подтверждены» filter.
  const reopened = await getAdminPayoutProfileDetail(db, profile.id);
  assert.equal(reopened.status, "verified");
  assert.equal(getAdminPayoutProfileStatusLabel(reopened.status), "Данные подтверждены");
  const verifiedList = await listAdminPayoutProfiles(db, { status: "verified" });
  assert.deepEqual(verifiedList.map((p) => p.id), [profile.id]);
  assert.equal(db.tables.author_payout_profile_status_events.at(-1).to_status, "verified");

  // Second press is idempotent.
  const again = await staffTransitionPayoutProfile({ supabase: db, profileId: profile.id, actorUserId: staff, toStatus: "verified" });
  assert.equal(again.transitioned, false);
}

{
  const db = createFakeSupabase();
  // Bank name made of digits only: submit allows it (any non-empty text),
  // but staff confirmation must be refused with a reason.
  const { profile } = await submitAuthorPayoutProfile({ supabase: db, authorId: author, actorUserId: author, body: { ...base, bank_name: "+7 900 000-00-02", author_id: author } });
  assert.equal(profile.status, "submitted");
  const detail = await getAdminPayoutProfileDetail(db, profile.id);
  assert.equal(detail.verify_blockers.length, 1);
  const row = db.tables.author_payout_profiles[0];
  const versionBefore = row.version;
  const eventsBefore = db.tables.author_payout_profile_status_events.length;
  await assert.rejects(
    () => staffTransitionPayoutProfile({ supabase: db, profileId: profile.id, actorUserId: staff, toStatus: "verified" }),
    (e) => e instanceof AuthorPayoutProfileError && e.code === "verify_blocked" && Object.values(e.fieldErrors ?? {}).length === 1,
  );
  assert.equal(row.status, "submitted");
  assert.equal(row.version, versionBefore);
  assert.equal(row.verified_at, null);
  assert.equal(db.tables.author_payout_profile_status_events.length, eventsBefore);
  // Requesting changes is still possible.
  const changes = await staffTransitionPayoutProfile({ supabase: db, profileId: profile.id, actorUserId: staff, toStatus: "needs_changes", reviewComment: "Укажите название банка." });
  assert.equal(changes.detail.status, "needs_changes");
}

console.log("admin-payout-profile-confirm-unit: ok");
