import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { selectGraduateProducts, validateGraduateProductIds, graduateText, type SchoolGraduate } from "../src/lib/school/graduates";
import { getPublishedCatalogProducts, type CatalogProduct } from "../src/lib/products/catalog";
import { mapCatalogProductToListingItem } from "../src/lib/catalog/listing";
import GraduateProducts from "../src/components/school-graduates/GraduateProducts";
import { createClient } from "@supabase/supabase-js";

async function main() {
const product = (id: string, authorId = "a"): CatalogProduct => ({
  id, authorId, title: `Продукт ${id}`, slug: id, subtitle: "Подназвание ".repeat(30),
  description: null, format: null, price: 0, isFree: true, coverUrl: null,
  authorName: "Учебный автор", authorSlug: authorId, href: `/practice/${authorId}/${id}`,
  meta: null, statsLabel: null, productTypeLabel: "Аудиопрактика", priceLabel: "Бесплатно", sortTimestamp: 0,
  durationSeconds: 61,
});
const graduate = (overrides: Partial<SchoolGraduate> = {}): SchoolGraduate => ({
  author_id: "a", enabled: true, position: 0, cohort: "Тест", product_1_id: "p1", product_2_id: "p2", ...overrides,
});
assert.equal(validateGraduateProductIds(["1", "2", "3"]), false);
assert.equal(validateGraduateProductIds(["1", "1"]), false);
assert.equal(validateGraduateProductIds(["1", "2"]), true);
assert.equal(validateGraduateProductIds([]), true);
const products = [product("p1"), product("p2"), product("p3", "b")];
assert.deepEqual(selectGraduateProducts([graduate({ product_1_id: "p2", product_2_id: "p1" })], products).map(p => p.id), ["p2", "p1"]);
assert.deepEqual(selectGraduateProducts([graduate({ position: 2 }), graduate({ author_id: "b", position: 1, product_1_id: "p3", product_2_id: null })], products).map(p => p.id), ["p3", "p1", "p2"]);
assert.equal(selectGraduateProducts([graduate({ enabled: false })], products).length, 0);
assert.deepEqual(selectGraduateProducts([], products), [], "unmarked authors never appear");
assert.deepEqual(selectGraduateProducts([graduate({ product_1_id: null, product_2_id: null })], products), [], "marking a graduate does not automatically pick products");
assert.equal(selectGraduateProducts([graduate({ product_1_id: "p3", product_2_id: null })], products).length, 0, "reject another author's selection");
assert.equal(selectGraduateProducts([graduate()], [products[0]]).length, 1, "missing/unpublished selections vanish without fallback products");
assert.equal(graduateText("Текст — подназвание"), "Текст – подназвание");
assert.equal(graduateText("x".repeat(170), 160).length, 160);

// Exercise the real catalog query and mapping against an in-memory REST transport.
// No DB/network access. The transport applies query filters, rather than returning
// pre-filtered catalog DTOs, so regressions in the canonical WHERE are observable.
const rows = [
  { id: "live", status: "published", catalog_visibility: "listed", deleted_at: null },
  { id: "draft", status: "draft", catalog_visibility: "listed", deleted_at: null },
  { id: "hidden", status: "published", catalog_visibility: "unlisted", deleted_at: null },
  { id: "private", status: "published", catalog_visibility: "selected_users", deleted_at: null },
  { id: "deleted", status: "published", catalog_visibility: "listed", deleted_at: "2026-01-01" },
  { id: "scheduled", status: "published", catalog_visibility: "listed", deleted_at: null, scheduled_publish_at: "2999-01-01" },
].map(row => ({ title: row.id, slug: row.id, author_id: "a", authors: { name: "Автор", slug: "a" },
  is_free: true, cover_url: "/initial-cover.webp", duration_minutes: 5, created_at: "2026-01-01", ...row }));
const calls: URL[] = [];
const supabase = createClient("http://127.0.0.1:1", "test-anon-key", {
  auth: { persistSession: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input)); calls.push(url);
    let data: unknown[] = [];
    if (url.pathname.endsWith("/practices")) {
      data = rows.filter(row => {
        for (const [key, filter] of url.searchParams) {
          const value = (row as Record<string, unknown>)[key];
          if (filter.startsWith("eq.") && String(value) !== filter.slice(3)) return false;
          if (filter === "is.null" && value != null) return false;
          if (filter.startsWith("in.(") && !filter.slice(4, -1).split(",").includes(String(value))) return false;
          if (filter === "not.is.null" && value == null) return false;
        }
        if (url.searchParams.has("or") && row.scheduled_publish_at && Date.parse(row.scheduled_publish_at) > Date.now()) return false;
        return true;
      });
    }
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  } },
});
const catalog = await getPublishedCatalogProducts(supabase, { productIds: rows.map(row => row.id), throwOnStorageError: true });
assert.deepEqual(catalog.map(p => p.id), ["live"], "unpublished, hidden, future and deleted products must be excluded");
assert.ok(calls.find(url => url.pathname.endsWith("/practices"))?.searchParams.has("or"), "scheduled publication WHERE must remain present");
const picked = graduate({ product_1_id: "live", product_2_id: "draft" });
assert.deepEqual(selectGraduateProducts([picked], catalog).map(p => p.id), ["live"]);
rows[0].title = "Новое название";
rows[0].cover_url = "/updated-cover.webp";
assert.equal((await getPublishedCatalogProducts(supabase, { productIds: ["live"] }))[0].title, "Новое название", "no copied stale product fields");
assert.equal((await getPublishedCatalogProducts(supabase, { productIds: ["live"] }))[0].coverUrl, "/updated-cover.webp", "cover remains tied to the source product");
rows[0].status = "draft";
assert.equal(selectGraduateProducts([picked], await getPublishedCatalogProducts(supabase, { productIds: ["live"] })).length, 0, "unpublishing the last chosen product hides the entire showcase");
assert.equal(await getPublishedCatalogProducts(supabase, { productIds: [] }).then(p => p.length), 0);

const cards = products.map(mapCatalogProductToListingItem);
assert.equal(renderToStaticMarkup(<GraduateProducts cards={[]} />), "");
for (const school of [true, false]) {
  const html = renderToStaticMarkup(<GraduateProducts cards={cards} school={school} />);
  assert.ok(html.includes(school ? 'href="https://audiolad.ru/practice/a/p1"' : 'href="/practice/a/p1"'));
  assert.ok(html.includes("2 мин"));
  assert.ok(html.includes("overflow-x-auto") && html.includes("snap-x") && html.includes("shrink-0"), "cards remain in one scrollable row");
  assert.ok(!html.includes("grid-cols-"));
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.length, cards.length);
  assert.ok(links.every(href => school ? new URL(href).origin === "https://audiolad.ru" : href.startsWith("/practice/")));
  assert.ok(!html.includes("—"));
  if (school) writeFileSync("/tmp/03f7-graduate-products.html", html);
}
const schoolPage = readFileSync("src/app/(platform)/school-site/page.tsx", "utf8");
assert.match(schoolPage, /<SchoolTestimonialsScreen \/>\s*<SchoolGraduateShowcase school \/>\s*<SchoolFaqScreen \/>/, "showcase must directly follow testimonials and precede FAQ");
const catalogPage = readFileSync("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx", "utf8");
assert.ok(!catalogPage.includes("SchoolGraduateShowcase"), "platform placement is not approved");
const sql = readFileSync("supabase/migrations/20270106120000_school_graduates.sql", "utf8");
assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY") && sql.includes("USING (enabled)"));
console.log("school-graduates: selection limit, ownership, order, canonical visibility, refresh, empty block and product links passed");

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
