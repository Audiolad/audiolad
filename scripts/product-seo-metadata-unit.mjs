#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUDIO_POST_KIND_LABEL,
} from "../src/lib/author-products/product-kind.ts";
import {
  buildProductSeoPreview,
  containsSeoPhrase,
  evaluateProductSeoReadiness,
  normalizeSeoPhrase,
  resolveLegacyProductSeoTitle,
  resolveProductMetaDescription,
  resolveProductSeoTitle,
} from "../src/lib/seo/product-metadata.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

assert.equal(normalizeSeoPhrase("  Медитация   для сна  "), "медитация для сна");
assert.equal(containsSeoPhrase("Медитация для сна «Лавандовый сон»", "медитация для сна"), true);
assert.equal(containsSeoPhrase("Лавандовый сон", "медитация для сна"), false);

// A. Primary query is internal and does not change a blank SEO title.
assert.equal(
  resolveProductSeoTitle({
    title: "Лавандовый сон",
    seoPrimaryQuery: "медитация для сна",
    seoTitle: null,
    productKind: "practice",
  }),
  "Лавандовый сон – АудиоЛад",
);

// B. Legacy title remains unchanged when it already contains the query.
assert.equal(
  resolveProductSeoTitle({
    title: "Медитация для сна «Лавандовый сон»",
    seoPrimaryQuery: "медитация для сна",
    seoTitle: null,
  }),
  "Медитация для сна «Лавандовый сон» – АудиоЛад",
);

// C. explicit seo_title has priority
assert.equal(
  resolveProductSeoTitle({
    title: "Лавандовый сон",
    seoPrimaryQuery: "медитация для сна",
    seoTitle: "Сон под дождь",
  }),
  "Сон под дождь – АудиоЛад",
);

// D. all SEO fields null → legacy metadata
assert.equal(
  resolveProductSeoTitle({
    title: "Лавандовый сон",
    productKind: "practice",
    seoPrimaryQuery: null,
    seoTitle: null,
    seoDescription: null,
  }),
  "Лавандовый сон – АудиоЛад",
);
assert.equal(
  resolveProductSeoTitle({
    title: "Вечерний разговор",
    productKind: "audio_post",
    seoPrimaryQuery: null,
    seoTitle: "",
    seoDescription: null,
  }),
  `Вечерний разговор – ${AUDIO_POST_KIND_LABEL} – АудиоЛад`,
);
assert.equal(
  resolveLegacyProductSeoTitle({
    title: "Вечерний разговор",
    productKind: "audio_post",
  }),
  `Вечерний разговор – ${AUDIO_POST_KIND_LABEL} – АудиоЛад`,
);

// E. seo_description has priority
assert.equal(
  resolveProductMetaDescription({
    title: "Лавандовый сон",
    description: "Длинное обычное описание продукта для слушателя.",
    subtitle: "Короткий подзаголовок",
    seoDescription: "Коротко: мягкая медитация для засыпания.",
    productKind: "practice",
  }),
  "Коротко: мягкая медитация для засыпания.",
);

// F. subtitle / description / type fallback
assert.equal(
  resolveProductMetaDescription({
    title: "Лавандовый сон",
    description: "Обычное описание продукта.",
    subtitle: "Подзаголовок",
    seoDescription: null,
  }),
  "Подзаголовок",
);
assert.equal(
  resolveProductMetaDescription({
    title: "Лавандовый сон",
    description: null,
    subtitle: "Подзаголовок для поиска",
    seoDescription: "",
  }),
  "Подзаголовок для поиска",
);
assert.equal(
  resolveProductMetaDescription({
    title: "Трек",
    productKind: "music",
    description: null,
    subtitle: null,
    seoDescription: null,
  }),
  "Музыкальный продукт на платформе АудиоЛад.",
);
assert.equal(
  resolveProductMetaDescription({
    title: "Пост",
    productKind: "audio_post",
    description: null,
    subtitle: null,
    seoDescription: null,
  }),
  "Аудиопост на платформе АудиоЛад.",
);
assert.equal(
  resolveProductMetaDescription({
    title: "Практика",
    productKind: "practice",
    description: null,
    subtitle: null,
    seoDescription: null,
  }),
  "Аудиопрактика на платформе АудиоЛад.",
);

const longDescription = "а".repeat(200);
const truncated = resolveProductMetaDescription({
  title: "Практика",
  description: longDescription,
});
assert.ok(truncated.endsWith("…"));
assert.ok([...truncated].length <= 161);

const preview = buildProductSeoPreview({
  title: "Лавандовый сон",
  seoPrimaryQuery: "медитация для сна",
  publicPath: "/practice/sergey/lavandovyy-son",
  description: "Описание для сниппета.",
});
assert.equal(preview.title, "Лавандовый сон – АудиоЛад");
assert.equal(preview.displayUrl, "audiolad.ru/practice/sergey/lavandovyy-son");
assert.equal(
  buildProductSeoPreview({ title: "Черновик" }).displayUrl,
  "audiolad.ru/practice/…",
);

const readiness = evaluateProductSeoReadiness({
  title: "Лавандовый сон",
  seoPrimaryQuery: "медитация для сна",
  seoDescription: "Мягкая медитация для сна перед отдыхом.",
  description: "а".repeat(180),
});
assert.equal(readiness.total, readiness.checks.length);
assert.ok(readiness.doneCount <= readiness.total);
assert.equal(readiness.doneCount, 4);

const fullReadiness = evaluateProductSeoReadiness({
  title: "Лавандовый сон",
  seoPrimaryQuery: "медитация для сна",
  seoTitle: "Медитация для сна – Лавандовый сон",
  seoDescription: "Мягкая медитация для сна перед отдыхом.",
  description: "а".repeat(180),
  seoAbout: "Подробный текст о вечернем ритуале и темпе дыхания.",
  seoUsageItems: ["Перед сном в наушниках"],
  seoFaqCount: 3,
  seoRelatedCount: 2,
});
assert.equal(fullReadiness.total, fullReadiness.checks.length);
assert.equal(fullReadiness.doneCount, fullReadiness.total);
assert.ok(fullReadiness.doneCount <= fullReadiness.total);
assert.equal(
  readiness.checks.find((check) => check.id === "substantial_description")?.label,
  "Короткое описание продукта достаточно подробное",
);
assert.equal(
  readiness.checks.find((check) => check.id === "about")?.label,
  "Заполнен блок «Подробнее о продукте»",
);

const page = read(
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
);
assert.match(page, /resolveProductSeoTitle/);
assert.match(page, /resolveProductMetaDescription/);
assert.match(page, /productTitle: practice\.title/);
assert.match(page, /title: practice\.title/);
assert.doesNotMatch(page, /seo_title as the product name/);
assert.doesNotMatch(page, /meta keywords|metaKeywords|name:\s*"keywords"/i);
assert.match(page, /loadPublicPracticeSeoContent/);
assert.doesNotMatch(page, /FAQPage|QAPage/);

const seoContent = read("src/components/products/PracticeSeoContentSections.tsx");
assert.match(seoContent, /getPracticeSeoUsageHeading/);
assert.match(seoContent, /Вопросы и ответы/);
assert.match(seoContent, /RelatedProductLinkCard/);
assert.match(seoContent, /Связанные продукты/);
assert.doesNotMatch(seoContent, /relatedListens|Связанные страницы/);
assert.doesNotMatch(seoContent, /FAQPage|QAPage/);
assert.equal(
  readiness.checks.find((check) => check.id === "related")?.label,
  "Добавлены связанные продукты",
);
assert.match(
  read("src/lib/products/practice-seo-content.ts"),
  /Как использовать практику/,
);

const jsonLd = read("src/lib/seo/json-ld/builders.ts");
assert.match(jsonLd, /name: input\.title/);
assert.doesNotMatch(jsonLd, /seo_title/);

console.log("product-seo-metadata-unit: ok");
