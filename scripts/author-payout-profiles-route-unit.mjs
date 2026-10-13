// Route-level regression (task 13c20153): broken JSON -> 400; a DB error (e.g. PGRST204
// missing column) gives the author a generic response with no values/column details.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

process.env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID = "test-key";
process.env.PAYOUT_PROFILES_ENABLED = "true";

const SECRET_CARD = "4111111111111111";
const SECRET_INN = "500100732259";
const SECRET_EMAIL = "synthetic-secret@example.test";

const dbError = {
  code: "PGRST204",
  message: "Could not find the 'payout_method' column of 'author_payout_profiles' in the schema cache",
  details: `Failing row contains (${SECRET_CARD}, ${SECRET_INN}, ${SECRET_EMAIL})`,
};
function failingSupabase() {
  const builder = {
    select: () => builder, insert: () => builder, update: () => builder,
    eq: () => builder, single: () => builder, maybeSingle: () => builder,
    then: (resolve, reject) =>
      Promise.resolve({ data: null, error: dbError }).then(resolve, reject),
  };
  // The first read (existing profile) must succeed with "no row"; every write fails.
  let reads = 0;
  return {
    from() {
      const b = {
        ...builder,
        select() { return b; },
        insert() { b._w = true; return b; },
        update() { b._w = true; return b; },
        eq() { return b; }, single() { return b; }, maybeSingle() { return b; },
        then(resolve, reject) {
          reads += 1;
          const res = b._w ? { data: null, error: dbError } : { data: null, error: null };
          return Promise.resolve(res).then(resolve, reject);
        },
      };
      return b;
    },
  };
}

const AUTHOR = "00000000-0000-4000-8000-000000000002";
const mocks = {
  "@/lib/author-products/auth": {
    requireAuthorMembership: async () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
    handleAuthorRouteError: () => new Response(JSON.stringify({ error: "internal" }), { status: 500 }),
  },
  "@/lib/author-terms/guard": { requireCurrentAuthorTermsAcceptance: async () => {} },
  "@/lib/author-support/audit": { recordAuthorSupportAudit: async () => {} },
  "@/lib/supabase/service-role": { createServiceRoleClient: () => failingSupabase() },
};
const Module = createRequire(import.meta.url)("node:module");
const originalLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === "server-only") return {};
  if (mocks[request]) return mocks[request];
  return originalLoad.call(this, request, ...rest);
};

const route = await import("../src/app/api/author/payout-profile/route.ts");
const logs = [];
const origError = console.error;
console.error = (...a) => logs.push(a.join(" "));

function req(method, body, raw) {
  return new Request(`http://localhost/api/author/payout-profile?author_id=${AUTHOR}`, {
    method,
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

// Broken JSON -> 400 invalid_request on PUT and POST.
for (const method of ["PUT", "POST"]) {
  const res = await route[method](req(method, null, "{not json"));
  assert.equal(res.status, 400, method);
  assert.deepEqual(await res.json(), { error: "invalid_request" });
}

// DB error (PGRST204) on save: generic 500, nothing leaks.
const body = {
  recipient_type: "self_employed", payout_method: "card",
  first_name: "Тест", last_name: "Тестов", email: SECRET_EMAIL,
  phone: "+79000000001", inn: SECRET_INN, card_number: SECRET_CARD,
  bank_name: "Тест-Банк", is_npd_declared: true, details_confirmed: true,
};
for (const [method, payload] of [["PUT", body], ["POST", { ...body, action: "submit" }]]) {
  const res = await route[method](req(method, payload));
  const text = await res.text();
  assert.equal(res.status, 500, method);
  const parsed = JSON.parse(text);
  assert.ok(parsed.error === "save_failed" || parsed.error === "submit_failed", text);
  for (const leak of [SECRET_CARD, SECRET_INN, SECRET_EMAIL, "PGRST204", "payout_method", "column", "schema cache", "author_payout_profiles"]) {
    assert.ok(!text.includes(leak), `${method} response leaks ${leak}`);
  }
}
// Logs carry no values either.
for (const line of logs) {
  for (const leak of [SECRET_CARD, SECRET_INN, SECRET_EMAIL]) {
    assert.ok(!line.includes(leak), "log leaks value");
  }
}
console.error = origError;
console.log("author-payout-profiles-route-unit: ok");
