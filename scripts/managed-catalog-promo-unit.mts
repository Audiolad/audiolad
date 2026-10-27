import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CatalogPromoCarousel = require("../src/components/catalog/CatalogPromoCarousel").default as
  typeof import("../src/components/catalog/CatalogPromoCarousel").default;
import {
  CATALOG_GRID_PROMO_AFTER_PRODUCTS,
  CATALOG_PROMO_ARTWORK_PATH,
  catalogGridPromoInsertAfter,
  isCatalogPromoArtwork,
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

assert.equal(CATALOG_GRID_PROMO_AFTER_PRODUCTS, 12);
assert.equal(catalogGridPromoInsertAfter(0), null);
assert.equal(catalogGridPromoInsertAfter(5), 4);
assert.equal(catalogGridPromoInsertAfter(12), 11);
assert.equal(catalogGridPromoInsertAfter(20), 11);
assert.equal(catalogGridPromoInsertAfter(40), 11);

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx");
const gridSource = read("src/components/products/CatalogProductGrid.tsx");
assert.match(page, /!isSearchActive && !isListingFiltered/);
assert.doesNotMatch(page, /<CatalogPromoCarousel/);
assert.match(page, /promos=\{promos\}/);
assert.ok(page.indexOf("<CatalogSectionCards") < page.indexOf("<CatalogProductGrid"));
assert.doesNotMatch(page, /authUser\s*&&.*[Pp]romo/);
assert.match(gridSource, /data-catalog-grid-promo/);
assert.match(gridSource, /catalogGridPromoInsertAfter/);
assert.equal(
  (gridSource.match(/<CatalogPromoCarousel/g) ?? []).length,
  2,
  "grid renders the promo once in the list and once for an empty listing",
);
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
assert.match(html, /target="_blank"/);
assert.match(html, /rel="noopener noreferrer"/);
assert.match(html, /aria-label="Школа аудиопрактик \(откроется в новой вкладке\)"/);
assert.match(html, /Школа аудиопрактик/);
assert.match(html, /Научитесь создавать аудиопрактики/);
assert.match(html, /alt=""/);
assert.doesNotMatch(html, /role="tablist"/);
assert.match(render({ ...school, title: "<script>test</script>" }), /&lt;script&gt;/);
assert.match(html, /w-24.*sm:w-48/);
assert.doesNotMatch(html, /[—―]/);

assert.equal(isCatalogPromoArtwork(CATALOG_PROMO_ARTWORK_PATH), true);
assert.equal(isCatalogPromoArtwork(`${CATALOG_PROMO_ARTWORK_PATH}?v=2`), true);
assert.equal(isCatalogPromoArtwork(school.image), false);
assert.equal(isCatalogPromoArtwork("/images/catalog-promo/not-school-audiopraktik.webp"), false);
const artwork = render({
  ...school,
  image: CATALOG_PROMO_ARTWORK_PATH,
  caption: "Научитесь создавать аудиопрактики",
});
assert.match(artwork, /data-catalog-promo-artwork/);
assert.match(artwork, new RegExp(`src="${CATALOG_PROMO_ARTWORK_PATH}"`));
assert.match(artwork, /alt="Школа аудиопрактик"/);
assert.match(artwork, /aria-label="Школа аудиопрактик \(откроется в новой вкладке\)"/);
assert.match(artwork, /target="_blank"/);
assert.match(artwork, /rel="noopener noreferrer"/);
const artworkImg = artwork.match(/<img\b[^>]*data-catalog-promo-artwork[^>]*>/)?.[0] ?? "";
assert.notEqual(artworkImg, "");
assert.doesNotMatch(artworkImg, /\s(?:width|height)=/);
assert.doesNotMatch(artwork, /Научитесь создавать аудиопрактики/);
assert.doesNotMatch(artwork, /Подробнее/);
assert.doesNotMatch(artwork, /object-cover|w-24|aspect-\[2\/1\]/);
assert.match(artwork, /href="https:\/\/school\.audiolad\.ru\/"/);
const artworkCss = read("src/app/globals.css");
assert.match(
  artworkCss,
  /\.catalog-promo-artwork \{\s*display:\s*block;\s*width:\s*100%;\s*max-width:\s*100%;\s*height:\s*auto;\s*object-fit:\s*contain;/,
);
assert.match(artworkCss, /\.catalog-promo-artwork \{[^}]*margin:\s*0;/);
assert.match(artworkCss, /\.catalog-promo-artwork \{[^}]*padding:\s*0;/);
assert.match(artworkCss, /\.catalog-promo-artwork \{[^}]*background:\s*transparent;/);
assert.match(artwork, /bg-transparent/);
assert.match(artwork, /\bp-0\b/);
assert.doesNotMatch(
  artworkCss,
  /\.catalog-promo-artwork \{[^}]*object-fit:\s*cover/,
);
assert.doesNotMatch(
  artworkCss,
  /\.catalog-promo-artwork \{[^}]*aspect-ratio/,
);
assert.match(gridSource, /promoAfterIndex === index/);
assert.match(gridSource, /data-catalog-grid-item/);
assert.doesNotMatch(gridSource, /isAuthenticated[\s\S]{0,80}CatalogPromoCarousel/);
assert.doesNotMatch(read("src/app/globals.css"), /@media[^{]+\{[^}]*\.catalog-product-grid__promo/);

console.log("managed-catalog-promo-unit: ok");
