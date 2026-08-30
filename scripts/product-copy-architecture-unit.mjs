#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCT_CONTENT_LIMITS } from "../src/lib/author-products/limits.ts";
import {
  AUTHOR_DESCRIPTION_HELPER,
  AUTHOR_DESCRIPTION_LABEL,
  PUBLIC_PRODUCT_DESCRIPTION_HEADING,
  resolveProductCopySections,
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

assert.equal(AUTHOR_DESCRIPTION_LABEL, "О продукте");
assert.equal(PUBLIC_PRODUCT_DESCRIPTION_HEADING, "О продукте");
assert.match(
  AUTHOR_DESCRIPTION_HELPER,
  /Расскажите, что это за продукт, для кого он/,
);
assert.match(AUTHOR_DESCRIPTION_HELPER, /До 1000 символов/);
assert.doesNotMatch(AUTHOR_DESCRIPTION_HELPER, /2–4 предложений/);

const filled = resolveProductCopySections(
  "Авторский текст о практике.",
);
assert.deepEqual(filled, {
  about: {
    heading: PUBLIC_PRODUCT_DESCRIPTION_HEADING,
    text: "Авторский текст о практике.",
  },
});

assert.equal(resolveProductCopySections("").about, null);
assert.equal(resolveProductCopySections("   ").about, null);
assert.equal(resolveProductCopySections(null).about, null);
assert.deepEqual(
  resolveProductCopySections(
    "Авторский текст о практике.",
    "LEGACY_SEO_ABOUT_MUST_NOT_RENDER",
  ),
  {
    about: {
      heading: PUBLIC_PRODUCT_DESCRIPTION_HEADING,
      text: "Авторский текст о практике.",
    },
  },
);

const copyModule = read("src/lib/products/product-copy.ts");
assert.doesNotMatch(copyModule, /SEO_ABOUT_LABEL|SEO_ABOUT_HELPER|SEO_ABOUT_AUTOFILL_HINT/);
assert.doesNotMatch(copyModule, /PUBLIC_SHORT_HEADING|PUBLIC_DETAIL_HEADING/);
assert.doesNotMatch(copyModule, /Коротко о продукте|Подробнее о продукте|Короткое описание продукта/);

const desktop = read("src/components/products/practice-page/PracticePageDesktop.tsx");
const mobile = read("src/components/products/practice-page/PracticePageMobile.tsx");
const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");
const copySections = read("src/components/products/ProductCopySections.tsx");
assert.match(desktop, /ProductCopySections/);
assert.match(mobile, /ProductCopySections/);
assert.match(audioPost, /ProductCopySections/);
assert.match(copySections, /sections\.about\.heading/);
assert.doesNotMatch(copySections, /seoAbout|sections\.short|sections\.detail/);
assert.doesNotMatch(copySections, /Коротко о продукте|Подробнее о продукте/);
assert.doesNotMatch(desktop, /seoAbout/);
assert.doesNotMatch(mobile, /seoAbout/);
assert.doesNotMatch(audioPost, /seoAbout/);
assert.doesNotMatch(desktop, /Коротко о продукте|Подробнее о продукте/);
assert.doesNotMatch(mobile, /Коротко о продукте|Подробнее о продукте/);
assert.doesNotMatch(audioPost, /Коротко о продукте|Подробнее о продукте/);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /AUTHOR_DESCRIPTION_LABEL/);
assert.match(form, /AUTHOR_DESCRIPTION_HELPER/);
assert.doesNotMatch(form, /"Описание"/);
assert.doesNotMatch(form, /"Описание \(необязательно\)"/);
assert.doesNotMatch(form, /Короткое описание продукта/);
assert.doesNotMatch(form, /seo_about: form\.seoAbout/);
assert.match(form, /seo_description: form\.seoDescription\.trim\(\) \|\| null/);

const practicePage = read(
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
);
assert.doesNotMatch(practicePage, /seoAbout: practice\.seo_about/);
assert.match(read("src/components/products/practice-page/types.ts"), /description: string \| null;/);
assert.doesNotMatch(read("src/components/products/practice-page/types.ts"), /seoAbout:/);

const seoSection = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.doesNotMatch(seoSection, /SEO_ABOUT_LABEL|SEO_ABOUT_HELPER|SEO_ABOUT_AUTOFILL_HINT/);
assert.doesNotMatch(seoSection, /Подробнее о продукте|seoAbout/);
assert.match(seoSection, /parseSeoSecondaryQueryList/);
assert.match(seoSection, /Добавить фразы/);
assert.match(seoSection, /addSecondaryPhrasesFromDraft/);
const bulkFn = seoSection.slice(
  seoSection.indexOf("function addSecondaryPhrasesFromDraft"),
  seoSection.indexOf("function applyGeneratedDraft"),
);
assert.match(bulkFn, /parseSeoSecondaryQueryList/);
assert.doesNotMatch(bulkFn, /fetch\(|alert\(|indexnow|webmaster|PATCH/i);

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

const overlongPhrase = "о".repeat(PRODUCT_CONTENT_LIMITS.seoSecondaryQuery + 1);
const overlongBulk = parseSeoSecondaryQueryList(
  `${overlongPhrase}, вечерняя практика, ${overlongPhrase}`,
);
assert.deepEqual(overlongBulk.added, ["вечерняя практика"]);
assert.equal(overlongBulk.added.some((item) => item.length > PRODUCT_CONTENT_LIMITS.seoSecondaryQuery), false);
assert.equal(overlongBulk.skippedTooLong, 2);
assert.match(
  formatSeoSecondaryQueryBulkMessage(overlongBulk),
  /Некоторые фразы слишком длинные и не были добавлены/,
);
assert.equal(
  parseSeoSecondaryQueryList(overlongPhrase).added.length,
  0,
);
assert.equal(
  parseSeoSecondaryQueryList("1. медитация для сна\n2) вечерняя медитация").added.length,
  2,
);

const prompt = read("src/lib/seo/product-autofill/prompt.ts");
assert.match(prompt, /Не переписывай, не пересказывай и не заменяй его/);
assert.match(prompt, /не возвращай поле seoAbout/);
assert.doesNotMatch(prompt, /Подробнее о продукте/);
assert.doesNotMatch(
  prompt,
  /Не пересказывай короткое описание. Используй его только как источник фактов и добавь новую информацию./,
);

const validate = read("src/lib/seo/product-autofill/validate.ts");
assert.doesNotMatch(validate, /collectSeoAboutDuplicationIssues/);
assert.doesNotMatch(validate, /about_duplicates_description/);
assert.doesNotMatch(validate, /about_starts_with_description/);
assert.doesNotMatch(validate, /about_opening_copies_description/);
assert.doesNotMatch(validate, /seoAbout/);
assert.doesNotMatch(validate, /cosine|embedding|similarity analyzer/i);

assert.match(read("src/lib/author-products/types.ts"), /description:/);
assert.match(read("src/lib/author-products/types.ts"), /seo_about:/);

console.log("product-copy-architecture-unit: ok");
