import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CatalogPromoCarousel = require("../src/components/catalog/CatalogPromoCarousel").default as
  typeof import("../src/components/catalog/CatalogPromoCarousel").default;
import {
  isPromoHref, isPromoImageUrl, parseManagedCatalogPromo, toCatalogPromos,
} from "../src/lib/catalog/catalog-promo";

const school = {
  id: "catalog", enabled: true, title: "Школа аудиопрактик",
  caption: "Научитесь создавать аудиопрактики",
  image: "/images/catalog-promo/school.svg", href: "https://school.audiolad.ru/",
};
assert.equal(toCatalogPromos(school)[0]?.href, school.href);
assert.equal(toCatalogPromos(school)[0]?.caption, school.caption);
assert.deepEqual(toCatalogPromos({ ...school, enabled: false }), []);
assert.deepEqual(toCatalogPromos(null), []);
assert.deepEqual(toCatalogPromos({}), []);
assert.equal(parseManagedCatalogPromo({ ...school, caption: "" })?.caption, "");
assert.equal(parseManagedCatalogPromo({ ...school, title: "  Школа  " })?.title, "Школа");
for (const bad of [
  { title: " " }, { title: "a".repeat(121) }, { caption: "a".repeat(241) },
  { image: "a".repeat(2049) }, { href: "a".repeat(2049) },
  { enabled: "true" }, { id: "other" }, { caption: null },
  { href: "javascript:alert(1)" }, { image: "data:image/svg+xml,abc" },
]) assert.equal(parseManagedCatalogPromo({ ...school, ...bad }), null);
for (const href of ["/catalog?q=сон", school.href, "https://audiolad.ru/"])
  assert.equal(isPromoHref(href), true, href);
for (const href of [
  "//evil.test", "/\\evil.test", "javascript:alert(1)", "http://school.audiolad.ru/",
  "https://school.audiolad.ru.evil.test/", "https://evil.test/",
  "https://audiolad.ru@evil.test/", "https://user@school.audiolad.ru/",
  "https://school.audiolad.ru:444/", "data:text/html,abc",
]) assert.equal(isPromoHref(href), false, href);
assert.equal(isPromoImageUrl("https://cdn.example.test/banner.webp?v=2"), true);
for (const image of ["//evil.test/image", "/\\evil.test", "http://cdn.test/a", "data:image/png,abc"])
  assert.equal(isPromoImageUrl(image), false, image);

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx");
assert.match(page, /!isSearchActive && !isListingFiltered/);
assert.ok(page.indexOf("<CatalogSectionCards") < page.indexOf("<CatalogPromoCarousel"));
assert.ok(page.indexOf("<CatalogPromoCarousel") < page.indexOf("<CatalogProductGrid"));
assert.doesNotMatch(page, /authUser\s*&&.*CatalogPromo/);
const action = read("src/app/(platform)/admin/promo-banner/actions.ts");
assert.ok(action.indexOf('requireAdminPermission("settings.manage")') < action.indexOf(".upsert("));
assert.match(action, /parseManagedCatalogPromo/);
assert.match(action, /error \|\| !data/);
const sql = read("supabase/migrations/20270129120000_platform_promo_banner.sql");
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.equal((sql.match(/'settings.manage'/g) ?? []).length, 3);
assert.equal((sql.match(/'admin_panel.access'/g) ?? []).length, 3);
assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\b/i);
assert.match(sql, /https:\/\/school\.audiolad\.ru\//);
const svg = read("public/images/catalog-promo/school.svg");
assert.match(svg, /Школа аудиопрактик/);
assert.doesNotMatch(svg, /[\x00-\x08\x0b\x0c\x0e-\x1f]/);
const render = (value: unknown) => renderToStaticMarkup(
  createElement(CatalogPromoCarousel, { promos: toCatalogPromos(value) }),
);
assert.equal(render({ ...school, enabled: false }), "");
assert.equal(render(null), "");
const html = render(school);
assert.match(html, /href="https:\/\/school\.audiolad\.ru\/"/);
assert.match(html, /Школа аудиопрактик/);
assert.match(html, /Научитесь создавать аудиопрактики/);
assert.match(html, /alt=""/);
assert.doesNotMatch(html, /role="tablist"/);
assert.match(render({ ...school, title: "<script>test</script>" }), /&lt;script&gt;/);
assert.match(html, /w-24.*sm:w-48/);
console.log("managed-catalog-promo-unit: ok");
