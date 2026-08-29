#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_DESCRIPTION_HELPER,
  AUTHOR_DESCRIPTION_LABEL,
  PUBLIC_DETAIL_HEADING,
  PUBLIC_SHORT_HEADING,
  resolveProductCopySections,
  SEO_ABOUT_AUTOFILL_HINT,
  SEO_ABOUT_HELPER,
  SEO_ABOUT_LABEL,
} from "../src/lib/products/product-copy.ts";
import {
  formatSeoSecondaryQueryBulkMessage,
  parseSeoSecondaryQueryList,
  stripObviousSeoListPrefix,
} from "../src/lib/seo/secondary-query-list.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

assert.equal(AUTHOR_DESCRIPTION_LABEL, "Короткое описание продукта");
assert.equal(SEO_ABOUT_LABEL, "Подробнее о продукте");
assert.equal(PUBLIC_SHORT_HEADING, "Коротко о продукте");
assert.equal(PUBLIC_DETAIL_HEADING, "Подробнее о продукте");
assert.match(
  AUTHOR_DESCRIPTION_HELPER,
  /2–4 предложений/,
);
assert.match(SEO_ABOUT_HELPER, /Не повторяйте его/);
assert.match(SEO_ABOUT_AUTOFILL_HINT, /АудиоЛад подготовит этот текст автоматически/);

const both = resolveProductCopySections(
  "Короткий текст о практике.",
  "Подробности о вечернем ритуале.",
);
assert.deepEqual(both, {
  short: {
    heading: PUBLIC_SHORT_HEADING,
    text: "Короткий текст о практике.",
  },
  detail: {
    heading: PUBLIC_DETAIL_HEADING,
    text: "Подробности о вечернем ритуале.",
  },
});

assert.equal(
  resolveProductCopySections("Короткий текст о практике.", "").detail,
  null,
);
assert.equal(
  resolveProductCopySections("Короткий текст о практике.", "   ").detail,
  null,
);
assert.equal(
  resolveProductCopySections("", "Подробности о вечернем ритуале.").short,
  null,
);
assert.equal(resolveProductCopySections(null, null).short, null);
assert.equal(resolveProductCopySections(null, null).detail, null);

const desktop = read("src/components/products/practice-page/PracticePageDesktop.tsx");
const mobile = read("src/components/products/practice-page/PracticePageMobile.tsx");
const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");
const copySections = read("src/components/products/ProductCopySections.tsx");
assert.match(desktop, /ProductCopySections/);
assert.match(mobile, /ProductCopySections/);
assert.match(audioPost, /ProductCopySections/);
assert.match(copySections, /PUBLIC_SHORT_HEADING|sections\.short\.heading/);
assert.match(copySections, /PUBLIC_DETAIL_HEADING|sections\.detail\.heading/);
assert.doesNotMatch(desktop, /О продукте/);
assert.doesNotMatch(mobile, /О продукте/);
assert.doesNotMatch(audioPost, /О продукте/);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /AUTHOR_DESCRIPTION_LABEL/);
assert.match(form, /AUTHOR_DESCRIPTION_HELPER/);
assert.doesNotMatch(form, /"Описание"/);
assert.doesNotMatch(form, /"Описание \(необязательно\)"/);

const seoSection = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(seoSection, /SEO_ABOUT_LABEL/);
assert.match(seoSection, /SEO_ABOUT_HELPER/);
assert.match(seoSection, /parseSeoSecondaryQueryList/);
assert.match(seoSection, /Добавить фразы/);
assert.match(seoSection, /addSecondaryPhrasesFromDraft/);
assert.doesNotMatch(
  seoSection.slice(seoSection.indexOf("function addSecondaryPhrasesFromDraft")),
  /fetch\(|alert\(|indexnow|webmaster/i,
);

assert.match(read("src/lib/author-products/types.ts"), /seo_about/);
assert.match(read("src/lib/author-products/form-merge.ts"), /description: practice\.description/);
assert.match(read("src/lib/author-products/form-merge.ts"), /seoAbout: practice\.seo_about/);

assert.deepEqual(
  parseSeoSecondaryQueryList("a, b, c").added,
  ["a", "b", "c"],
);
assert.deepEqual(
  parseSeoSecondaryQueryList("a; b; c").added,
  ["a", "b", "c"],
);
assert.deepEqual(
  parseSeoSecondaryQueryList("a\nb\nc").added,
  ["a", "b", "c"],
);
assert.deepEqual(
  parseSeoSecondaryQueryList("a, b\nc; d").added,
  ["a", "b", "c", "d"],
);
assert.deepEqual(
  parseSeoSecondaryQueryList("  медитация для сна  ,   ").added,
  ["медитация для сна"],
);
assert.deepEqual(parseSeoSecondaryQueryList(" , ;\n ").added, []);
assert.deepEqual(
  parseSeoSecondaryQueryList("сон, сон, СОН").added,
  ["сон"],
);
assert.deepEqual(
  parseSeoSecondaryQueryList("сон", { existing: ["СОН"] }).added,
  [],
);
assert.equal(
  parseSeoSecondaryQueryList("сон", { existing: ["СОН"] }).skippedDuplicates,
  1,
);
assert.deepEqual(
  parseSeoSecondaryQueryList("медитация для сна, вечерняя практика", {
    primaryQuery: "Медитация для сна",
  }).added,
  ["вечерняя практика"],
);
assert.equal(
  parseSeoSecondaryQueryList("медитация для сна", {
    primaryQuery: "медитация для сна",
  }).skippedPrimary,
  1,
);

const eightExisting = [
  "одна",
  "две",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
];
const overflow = parseSeoSecondaryQueryList("девять, десять, одиннадцать, двенадцать, тринадцать", {
  existing: eightExisting,
});
assert.deepEqual(overflow.added, ["девять", "десять"]);
assert.equal(overflow.next.length, 10);
assert.equal(overflow.skippedFull, 3);
assert.equal(
  formatSeoSecondaryQueryBulkMessage(overflow),
  "Добавлено 2 фразы. Можно использовать не больше 10.",
);

assert.deepEqual(
  parseSeoSecondaryQueryList("медитация для сна").added,
  ["медитация для сна"],
);
assert.deepEqual(
  parseSeoSecondaryQueryList("1. медитация для сна\n2) вечерняя медитация").added,
  ["медитация для сна", "вечерняя медитация"],
);
assert.deepEqual(
  parseSeoSecondaryQueryList("- медитация перед сном\n• практика для сна").added,
  ["медитация перед сном", "практика для сна"],
);
assert.equal(
  stripObviousSeoListPrefix("10 минут медитации для сна"),
  "10 минут медитации для сна",
);
assert.deepEqual(
  parseSeoSecondaryQueryList("10 минут медитации для сна").added,
  ["10 минут медитации для сна"],
);

const duplicateMessage = formatSeoSecondaryQueryBulkMessage(
  parseSeoSecondaryQueryList("сон", { existing: ["сон"] }),
);
assert.equal(duplicateMessage, "Некоторые фразы уже были добавлены.");

const prompt = read("src/lib/seo/product-autofill/prompt.ts");
assert.match(
  prompt,
  /Короткое описание продукта уже будет показано выше на публичной странице/,
);
assert.match(prompt, /Не пересказывай и не перефразируй его/);
assert.match(prompt, /Новая полезная информация важнее длины/);
assert.match(
  prompt,
  /Не пересказывай короткое описание. Используй его только как источник фактов и добавь новую информацию./,
);

const validate = read("src/lib/seo/product-autofill/validate.ts");
assert.match(validate, /collectSeoAboutDuplicationIssues/);
assert.match(validate, /about_duplicates_description/);
assert.match(validate, /about_starts_with_description/);
assert.match(validate, /about_opening_copies_description/);
assert.doesNotMatch(validate, /cosine|embedding|similarity analyzer/i);

assert.match(read("src/lib/author-products/types.ts"), /description:/);
assert.match(read("src/lib/author-products/types.ts"), /seo_about:/);

console.log("product-copy-architecture-unit: ok");
