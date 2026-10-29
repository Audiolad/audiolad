/**
 * «Следующий шаг» product picker: authors pick one of their own published
 * products instead of pasting a link. Run: npx tsx scripts/next-step-product-picker-unit.mts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import * as lib from "../src/lib/products/next-step-product-options";
import {
  resolvePublicPromoRecommendation,
  validatePromoRecommendation,
} from "../src/lib/products/promo-recommendation";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const libPath = "src/lib/products/next-step-product-options.ts";
const routePath = "src/app/api/author/next-step-products/route.ts";
const pickerPath = "src/components/author-dashboard/product-form-sections/NextStepProductPicker.tsx";
const sectionPath =
  "src/components/author-dashboard/product-form-sections/AuthorProductPostListenPromoSection.tsx";
const formPath = "src/components/author-dashboard/AuthorProductForm.tsx";

for (const rel of [libPath, routePath, pickerPath]) {
  assert.ok(existsSync(path.join(root, rel)), `${rel} must exist`);
}


const OWN_A = "author-a";
const OWN_B = "author-b";
const base = {
  status: "published",
  deleted_at: null,
  catalog_visibility: "listed",
};
const rows = [
  { ...base, id: "p1", title: "Утренний аудиопост", slug: "utro", product_kind: "audio_post", format: null, author_id: OWN_A, authors: { name: "Анна", slug: "anna" } },
  { ...base, id: "p2", title: "Практика сна", slug: "son", product_kind: "practice", format: "Медитация", author_id: OWN_B, authors: [{ name: "Анна Лес", slug: "anna-les" }] },
  { ...base, id: "p3", title: "Курс дыхания", slug: "kurs", product_kind: "practice", publication_class: "course", format: null, author_id: OWN_A, authors: { name: "Анна", slug: "anna" } },
  { ...base, id: "p4", title: "Трек", slug: "trek", product_kind: "music", format: "Музыкальный трек", author_id: OWN_A, catalog_visibility: "unlisted", authors: { name: "Анна", slug: "anna" } },
  { ...base, id: "current", title: "Этот пост", slug: "etot", product_kind: "audio_post", author_id: OWN_A, authors: { name: "Анна", slug: "anna" } },
  { ...base, id: "foreign", title: "Чужой", slug: "chuzhoy", author_id: "other", authors: { name: "Другой", slug: "drugoy" } },
  { ...base, id: "draft", title: "Черновик", slug: "draft", status: "draft", author_id: OWN_A, authors: { name: "Анна", slug: "anna" } },
  { ...base, id: "deleted", title: "Удалён", slug: "del", deleted_at: "2026-10-01", author_id: OWN_A, authors: { name: "Анна", slug: "anna" } },
  { ...base, id: "private", title: "Для избранных", slug: "priv", catalog_visibility: "selected_users", author_id: OWN_A, authors: { name: "Анна", slug: "anna" } },
];

const options = lib.mapNextStepProductRows(rows, {
  allowedAuthorIds: [OWN_A, OWN_B],
  excludeProductId: "current",
  resolveCoverUrl: (row: { id?: unknown }) => (row.id === "p1" ? "https://cdn.example/c.webp" : null),
});

assert.deepEqual(
  options.map((o: { id: string }) => o.id),
  ["p1", "p2", "p3", "p4"],
  "only own published link-reachable products, current excluded",
);
assert.equal(options[0].href, "/practice/anna/utro");
assert.equal(options[1].href, "/practice/anna-les/son", "products of a second pseudonym are listed");
assert.equal(options[0].coverUrl, "https://cdn.example/c.webp");
assert.equal(options[0].typeLabel, "Аудиопост");
assert.equal(options[1].typeLabel, "Медитация");
assert.equal(options[2].typeLabel, "Аудиокурс");
assert.equal(options[3].typeLabel, "Музыка");
assert.equal(lib.getNextStepProductTypeLabel({ format: "Аудиоистория", product_kind: "practice" }), "Аудиоистория");
assert.equal(lib.getNextStepProductTypeLabel({}), "Аудиопрактика");

// Selecting fills the link and only empty texts.
const empty = { promoTitle: "", promoButtonText: " ", promoUrl: "https://old.example", promoText: "x" };
const picked = lib.applyNextStepProductSelection(empty, options[0]);
assert.equal(picked.promoUrl, "/practice/anna/utro");
assert.equal(picked.promoTitle, "Утренний аудиопост");
assert.equal(picked.promoButtonText, lib.NEXT_STEP_DEFAULT_BUTTON_TEXT);
assert.equal(picked.promoText, "x");
const filled = lib.applyNextStepProductSelection(
  { promoTitle: "Мой заголовок", promoButtonText: "Слушать", promoUrl: "" },
  options[1],
);
assert.equal(filled.promoTitle, "Мой заголовок");
assert.equal(filled.promoButtonText, "Слушать");
assert.equal(filled.promoUrl, "/practice/anna-les/son");

// The stored value is a valid in-app next step.
const validation = validatePromoRecommendation({
  promo_enabled: true,
  promo_title: picked.promoTitle,
  promo_text: "Текст",
  promo_button_text: picked.promoButtonText,
  promo_url: picked.promoUrl,
});
assert.equal(validation.ok, true);
const publicRec = resolvePublicPromoRecommendation({
  promo_enabled: true,
  promo_title: "Т",
  promo_text: "Т",
  promo_button_text: "Т",
  promo_url: picked.promoUrl,
});
assert.equal(publicRec?.target.kind, "internal");
assert.equal(publicRec?.target.href, "/practice/anna/utro");

// Legacy saved data keeps working.
assert.equal(
  resolvePublicPromoRecommendation({
    promo_enabled: true, promo_title: "Т", promo_text: "Т", promo_button_text: "Т", promo_url: "https://example.com/x",
  })?.target.kind,
  "external",
);

// Search helpers.
assert.equal(lib.normalizeNextStepProductQuery("  сон%_,(*)  "), "сон");
assert.equal(lib.normalizeNextStepProductQuery("a".repeat(500)).length, lib.NEXT_STEP_PRODUCT_QUERY_MAX_LENGTH);
assert.deepEqual(lib.filterNextStepProductOptions(options, "СНА").map((o: { id: string }) => o.id), ["p2"]);
assert.deepEqual(lib.filterNextStepProductOptions(options, "музыка").map((o: { id: string }) => o.id), ["p4"]);
assert.equal(lib.findSelectedNextStepProduct(options, " /practice/anna/kurs ")?.id, "p3");
assert.equal(lib.findSelectedNextStepProduct(options, ""), null);

// Route: server-side scope from memberships, published only, no client author IDs.
const route = read(routePath);
assert.match(route, /requireAuthenticatedUser\(\)/);
assert.match(route, /listAuthorWorkspacesForUser\(user\.id/);
assert.match(route, /\.in\("author_id", authorIds\)/);
assert.match(route, /\.eq\("status", "published"\)/);
assert.match(route, /\.is\("deleted_at", null\)/);
assert.match(route, /applyPracticePublicAvailabilityFilter/);
assert.doesNotMatch(route, /searchParams\.get\("author/);

// UI wiring.
const section = read(sectionPath);
assert.match(section, /<NextStepProductPicker/);
assert.match(section, /Или вставьте ссылку/);
assert.match(section, /onChange=\{\(event\) => onPromoUrlChange\(event\.target\.value\)\}/, "manual link stays");
const form = read(formPath);
assert.match(form, /onPromoProductPick=\{\(option\) =>/);
assert.match(form, /applyNextStepProductSelection\(current, option\)/);
assert.match(form, /currentProductId=\{practiceId \|\| null\}/);

const picker = read(pickerPath);
assert.match(picker, /Выбрать свой продукт/);
assert.match(picker, /Найти по названию/);
assert.match(picker, /\/api\/author\/next-step-products/);

// Copy rules: no em dash in new UI/lib files.
for (const rel of [libPath, pickerPath, sectionPath]) {
  assert.ok(!read(rel).includes("\u2014"), `${rel} must not contain an em dash`);
}

console.log("next-step-product-picker-unit: ok");
