import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { selectGraduateProducts, validateGraduateProductIds, graduateText, type SchoolGraduate } from "../src/lib/school/graduates";
import { graduateCarouselEdges, graduateCarouselStep } from "../src/components/school-graduates/carousel";
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
assert.equal(catalog[0].durationSeconds ?? null, null, "audio duration is absent");
assert.equal(catalog[0].durationMinutes, 5, "duration_minutes stays available as the card fallback");
assert.equal(mapCatalogProductToListingItem(catalog[0]).duration_seconds, 300);
assert.ok(renderToStaticMarkup(<GraduateProducts cards={[mapCatalogProductToListingItem(catalog[0])]} school />).includes("5 мин"));
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
const minutesOnly = product("minutes");
minutesOnly.durationSeconds = null;
minutesOnly.durationMinutes = 8;
assert.ok(renderToStaticMarkup(<GraduateProducts cards={[mapCatalogProductToListingItem(minutesOnly)]} />).includes("8 мин"));
for (const school of [true, false]) {
  const html = renderToStaticMarkup(<GraduateProducts cards={cards} school={school} />);
  assert.ok(html.includes(school ? 'href="https://audiolad.ru/practice/a/p1"' : 'href="/practice/a/p1"'));
  assert.ok(html.includes("2 мин"));
  if (school) {
    assert.ok(html.includes("school-graduates") && html.includes("school-graduates__row") && html.includes("school-graduates__card"), "landing block uses the school section shell");
    assert.ok(html.includes('aria-label="Назад"') && html.includes('aria-label="Вперёд"'), "desktop controls are in the school block");
    assert.equal([...html.matchAll(/school-graduates__arrow[^>]*hidden=""/g)].length, 2, "arrows stay hidden until the row actually overflows");
    assert.ok(html.includes("school-graduates__fade--start") && html.includes("school-graduates__fade--end"));
    assert.ok(!html.includes("max-w-6xl"));
  } else {
    assert.ok(html.includes("overflow-x-auto") && html.includes("snap-x") && html.includes("shrink-0"), "cards remain in one scrollable row");
    assert.ok(!html.includes("school-graduates__arrow") && !html.includes("Назад"), "non-school row has no desktop arrows");
  }
  assert.ok(!html.includes("grid-cols-"));
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.length, cards.length);
  assert.ok(links.every(href => school ? new URL(href).origin === "https://audiolad.ru" : href.startsWith("/practice/")));
  assert.ok(!html.includes("—"));
  if (school) writeFileSync("/tmp/03f7-graduate-products.html", html);
}
assert.deepEqual(graduateCarouselEdges(0, 400, 400), { overflow: false, canPrev: false, canNext: false });
assert.deepEqual(graduateCarouselEdges(0, 1000, 300), { overflow: true, canPrev: false, canNext: true });
assert.deepEqual(graduateCarouselEdges(350, 1000, 300), { overflow: true, canPrev: true, canNext: true });
assert.deepEqual(graduateCarouselEdges(700, 1000, 300), { overflow: true, canPrev: true, canNext: false });
assert.equal(graduateCarouselStep(280, 14, 1), 294);
assert.equal(graduateCarouselStep(280, 14, -1), -294);
const graduatesCss = readFileSync("src/components/school/school-landing.css", "utf8");
assert.match(graduatesCss, /flex:\s*0 0 80%/, "mobile card width stays a peek of the next card");
assert.match(graduatesCss, /min-width:\s*768px\)[\s\S]*flex-basis:\s*calc\(\(100% - 0\.85rem\) \/ 2\)/);
assert.match(graduatesCss, /min-width:\s*1024px\)[\s\S]*flex-basis:\s*calc\(\(100% - 3 \* 0\.85rem\) \/ 3\.3\)/);
assert.match(graduatesCss, /\.school-graduates__arrow,\s*\.school-graduates__fade \{\s*display:\s*none;/);
assert.match(graduatesCss, /\.school-graduates__arrow\[hidden\] \{\s*display:\s*none !important;/);
const scrollerSource = readFileSync("src/components/school-graduates/SchoolGraduateScroller.tsx", "utf8");
assert.equal(scrollerSource.includes("—"), false);
assert.equal(readFileSync("src/components/school-graduates/GraduateProducts.tsx", "utf8").includes("—"), false);
const schoolPage = readFileSync("src/app/(platform)/school-site/page.tsx", "utf8");
assert.match(schoolPage, /<SchoolTestimonialsScreen \/>\s*<SchoolGraduateShowcase school \/>\s*<SchoolFaqScreen \/>/, "showcase must directly follow testimonials and precede FAQ");
const catalogPage = readFileSync("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx", "utf8");
assert.ok(!catalogPage.includes("SchoolGraduateShowcase"), "platform placement is not approved");
const migrationName = "supabase/migrations/20270130120000_school_graduates.sql";
assert.equal(existsSync("supabase/migrations/20270106120000_school_graduates.sql"), false);
const sql = readFileSync(migrationName, "utf8");
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /REVOKE ALL ON TABLE public\.school_graduates FROM PUBLIC, anon, authenticated/);
assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.validate_school_graduate_selection\(\) FROM PUBLIC/);
assert.match(sql, /school_graduate_showcase/);
assert.doesNotMatch(sql, /GRANT SELECT ON public\.school_graduates TO anon/);
assert.doesNotMatch(sql, /DROP |UPDATE public\.practices|UPDATE public\.authors/);
const actions = readFileSync("src/app/(platform)/admin/school-graduates/actions.ts", "utf8");
assert.match(actions, /\/admin\/product-moderation\/\$\{id\}/);
assert.doesNotMatch(actions, /author-dashboard/);
assert.match(actions, /только опубликованные/);
assert.doesNotMatch(actions, /status=published/);
const adminPage = readFileSync("src/app/(platform)/admin/school-graduates/page.tsx", "utf8");
assert.match(adminPage, /href="\/admin\/school-graduates"/);
const editor = readFileSync("src/components/admin/SchoolGraduatesEditor.tsx", "utf8");
assert.match(editor, /errorLinks/);
assert.doesNotMatch(editor, /errorHref/);
const prDoc = readFileSync("docs/SCHOOL_GRADUATES_PR.md", "utf8");
assert.doesNotMatch(prDoc, /REPORT\.md/);
console.log("school-graduates: selection limit, ownership, order, canonical visibility, refresh, empty block and product links passed");

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
