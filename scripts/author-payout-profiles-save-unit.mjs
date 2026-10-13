// Regression for task 13c20153: author could not save payout details / draft.
// Synthetic data only (fake card/INN/phone), in-memory Supabase fake.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID = "test-key";

const {
  AuthorPayoutProfileError,
  describePayoutDbError,
  saveAuthorPayoutProfileDraft,
  submitAuthorPayoutProfile,
} = await import("../src/lib/author-payout-profiles/service.ts");
const { describePayoutSaveFailure } = await import(
  "../src/lib/author-payout-profiles/save-error-message.ts"
);
const { validateAuthorPayoutProfileFormValues, normalizeAuthorPayoutProfileFormValues } =
  await import("../src/lib/author-payout-profiles/validation.ts");

function createFakeSupabase() {
  const tables = {
    author_payout_profiles: [],
    author_payout_profile_status_events: [],
  };
  let seq = 0;
  return {
    tables,
    from(table) {
      const rows = tables[table];
      let op = "select";
      let payload = {};
      const conds = [];
      const matches = () => rows.filter((r) => conds.every(([k, v]) => r[k] === v));
      const builder = {
        insert(p) { op = "insert"; payload = p; return builder; },
        update(p) { op = "update"; payload = p; return builder; },
        select() { return builder; },
        eq(k, v) { conds.push([k, v]); return builder; },
        single() { return builder; },
        maybeSingle() { return builder; },
        then(resolve, reject) {
          let data = null;
          if (op === "insert") {
            data = { id: `id-${++seq}`, created_at: "t", updated_at: "t", review_comment: null, staff_note: null, reviewed_by: null, submitted_at: null, review_started_at: null, verified_at: null, rejected_at: null, ...payload };
            rows.push(data);
          } else if (op === "update") {
            data = matches()[0] ?? null;
            if (data) Object.assign(data, payload);
          } else {
            data = matches()[0] ?? null;
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const base = {
  recipient_type: "self_employed",
  payout_method: "card",
  first_name: "Тест",
  last_name: "Тестов",
  email: "synthetic@example.test",
  phone: "+7 (900) 000-00-01",
  inn: "500100732259",
  card_number: "4111 1111 1111 1111",
  bank_name: "Тест-Банк",
  is_npd_declared: true,
  details_confirmed: true,
};
const actor = "00000000-0000-4000-8000-000000000001";
const author = "00000000-0000-4000-8000-000000000002";

async function save(db, body) {
  return saveAuthorPayoutProfileDraft({ supabase: db, authorId: author, actorUserId: actor, body: { ...body, author_id: author } });
}
async function submit(db, body) {
  return submitAuthorPayoutProfile({ supabase: db, authorId: author, actorUserId: actor, body: { ...body, author_id: author } });
}

// 1. Draft tolerates half-typed / malformed values (used to be 400 -> generic error).
for (const patch of [
  { inn: "5001007" },
  { phone: "900 000 00 01" },
  { card_number: "4111" },
  { email: "not-an-email" },
  { bank_bik: "04", bank_account: "123", bank_correspondent_account: "1" },
  { ogrnip: "12345" },
]) {
  const db = createFakeSupabase();
  const profile = await save(db, { ...base, ...patch });
  assert.equal(profile.status, "draft", JSON.stringify(Object.keys(patch)));
}

// 2. Draft still rejects unsafe text and unknown recipient type.
{
  const db = createFakeSupabase();
  await assert.rejects(
    () => save(db, { ...base, first_name: "<script>" }),
    (e) => e instanceof AuthorPayoutProfileError && e.code === "validation_failed" && Boolean(e.fieldErrors?.first_name),
  );
  await assert.rejects(
    () => save(db, { ...base, recipient_type: "" }),
    (e) => e instanceof AuthorPayoutProfileError && e.code === "validation_failed",
  );
}

// 3. Submit stays strict.
{
  const db = createFakeSupabase();
  await assert.rejects(
    () => submit(db, { ...base, inn: "5001007" }),
    (e) => e instanceof AuthorPayoutProfileError && Boolean(e.fieldErrors?.inn),
  );
  const ok = await submit(db, base);
  assert.equal(ok.profile.status, "submitted");
}

// 4. A stale OGRNIP of a non-IP recipient (field is dropped on save) must not block submit.
{
  const db = createFakeSupabase();
  const ok = await submit(db, { ...base, ogrnip: "123" });
  assert.equal(ok.profile.status, "submitted");
  const ipErrors = validateAuthorPayoutProfileFormValues(
    normalizeAuthorPayoutProfileFormValues({ ...base, recipient_type: "individual_entrepreneur", ogrnip: "123" }),
    { mode: "submit" },
  );
  assert.ok(ipErrors.ogrnip);
}

// 5. Re-saving an existing draft, then submitting without re-typing the card, works.
{
  const db = createFakeSupabase();
  await save(db, base);
  await save(db, { ...base, card_number: "", first_name: "Тест2" });
  const ok = await submit(db, { ...base, card_number: "" });
  assert.equal(ok.profile.status, "submitted");
  assert.equal(db.tables.author_payout_profiles[0].account_last4, "1111");
}

// 6. Safe DB error description never leaks values.
assert.equal(
  describePayoutDbError({ code: "23514", message: 'new row for relation "author_payout_profiles" violates check constraint "author_payout_profiles_account_last4_check"', details: "Failing row contains (4111111111111111)" }),
  "23514 constraint=author_payout_profiles_account_last4_check",
);
assert.equal(describePayoutDbError({ code: "PGRST204", message: "Could not find the 'payout_method' column of 'author_payout_profiles' in the schema cache" }), "PGRST204 column=payout_method");

// 7. UI messages are specific and value-free.
assert.match(describePayoutSaveFailure({ kind: "draft", httpStatus: 400, error: "validation_failed", fieldErrors: { inn: "x", bank_bik: "y" } }), /ИНН, БИК/);
assert.match(describePayoutSaveFailure({ kind: "complete", httpStatus: 403, error: "AUTHOR_TERMS_ACCEPTANCE_REQUIRED" }), /условия для авторов/);
assert.match(describePayoutSaveFailure({ kind: "complete", httpStatus: 503, error: "encryption_unavailable" }), /хранилище/);
assert.match(describePayoutSaveFailure({ kind: "draft", httpStatus: 502 }), /^Не удалось сохранить черновик\./);
assert.match(describePayoutSaveFailure({ kind: "complete", httpStatus: 403, error: "feature_not_available" }), /временно недоступно/);

// 8. Unsafe text (<, >, control chars) is rejected on EVERY text field, in draft and
//    submit, on the raw value (before normalization strips digits/whitespace).
{
  const fields = [
    "email", "inn", "ogrnip", "bank_bik", "bank_account",
    "bank_correspondent_account", "phone", "card_number",
    "first_name", "last_name", "middle_name", "bank_name",
    "legal_name", "registration_address", "tax_residency_note", "author_revision_comment",
  ];
  const bad = ["12<3", "12>3", "12\u00003", "12\u000B3", "12\u007F3"];
  for (const field of fields) {
    for (const value of bad) {
      for (const run of [save, submit]) {
        const db = createFakeSupabase();
        await assert.rejects(
          () => run(db, { ...base, [field]: value }),
          (e) =>
            e instanceof AuthorPayoutProfileError &&
            e.code === "validation_failed" &&
            e.fieldErrors?.[field] === "Недопустимые символы.",
          `${run.name} ${field} ${JSON.stringify(value)}`,
        );
        assert.equal(db.tables.author_payout_profiles.length, 0, `${field}: nothing stored`);
      }
    }
  }
  // Ordinary whitespace in digit fields is still fine for a draft.
  const db = createFakeSupabase();
  const ok = await save(db, { ...base, card_number: "4111 1111\t1111 1111", inn: "5001 0073 2259" });
  assert.equal(ok.status, "draft");
}

console.log("author-payout-profiles-save-unit: ok");
