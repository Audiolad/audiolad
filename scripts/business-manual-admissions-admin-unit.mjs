import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require("react-dom/server");
let denied = false;
let failed = false;
let search;
const fixture = {
  business_content_directions: [{ key: "spa", name: "SPA / медитативные центры" }],
  business_content_admission_audit: [],
  business_content_admissions: [{ author_id: "artist", practice_id: null, direction_key: "spa", allowed: true, changed_by: "moderator", changed_at: "2026-10-27T12:00:00Z" },
    { author_id: null, practice_id: "album", direction_key: "spa", allowed: false, changed_by: "moderator", changed_at: "2026-10-27T12:00:00Z" }],
};
function mock(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
mock("../src/lib/admin/guard.ts", { requireAdminPermission: async (permission) => {
  assert.equal(permission, "author_products.moderate");
  if (denied) throw new Error("forbidden");
} });
mock("../src/lib/supabase/service-role.ts", { createServiceRoleClient: () => ({
  from(table) {
    const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, or() { return this; },
      then(resolve) { return Promise.resolve({ data: fixture[table], error: failed ? { message: "unavailable" } : null }).then(resolve); } };
    return query;
  },
  async rpc(name, params) {
    if (name === "business_manual_content_gate_enabled") return { data: false, error: null };
    assert.equal(name, "list_business_content_admissions");
    search = params;
    return { data: [{ id: params.p_kind === "album" ? "album" : "artist", title: params.p_kind === "album" ? "Активный альбом" : "Ирина Ведянина", author_id: "artist", author_name: "Ирина Ведянина" }], error: null };
  },
}) });
mock("../src/app/(platform)/admin/business-admissions/actions.ts", { saveBusinessAdmissions: async () => {}, addBusinessDirection: async () => {}, setBusinessManualContentGate: async () => {} });
const Page = require("../src/app/(platform)/admin/business-admissions/page.tsx").default;
async function render(params) { return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) })); }
const artist = await render({ kind: "artist" });
assert.match(artist, /Ручные ворота выключены/);
assert.match(artist, /Разрешено – артист/);
assert.match(artist, /Применить к выбранным/);
const album = await render({ kind: "album", q: "Ирина", direction: "spa", decision: "denied", page: "2" });
assert.match(album, /Не допущено – альбом/);
assert.match(album, /От артиста/);
assert.match(album, /href="\/admin\/business-verification"/);
assert.match(album, /действующих прав на каждый трек/);
assert.deepEqual(search, { p_kind: "album", p_query: "Ирина", p_direction: "spa", p_decision: "denied", p_offset: 50, p_limit: 51 });
assert.doesNotMatch(album, /—/);
failed = true;
assert.match(await render({}), /Таблица недоступна/);
denied = true;
await assert.rejects(() => render({}), /forbidden/);
console.log("Manual admission admin: artist/album rendering, filters, overrides, legal notice, unavailable and forbidden – PASS");
