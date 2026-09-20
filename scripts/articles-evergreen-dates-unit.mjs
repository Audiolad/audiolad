#!/usr/bin/env node
/**
 * SEO articles stay evergreen in public HTML + Article JSON-LD.
 * Technical publishedAt/updatedAt remain for sitemap lastModified.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildArticleJsonLd,
  listArticleDefinitions,
  listArticleSlugs,
} from "../src/lib/seo/articles/index.ts";
import { mapArticleDefinitionsToSitemapEntries } from "../src/lib/seo/sitemap-data.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const articles = listArticleDefinitions();
const slugs = listArticleSlugs();
assert.equal(articles.length, 103);
assert.equal(slugs.length, 103);
assert.ok(slugs.includes("meditatsii-dlya-klientov-psikhologa"));

const view = read("src/components/articles/ArticlePageView.tsx");
assert.doesNotMatch(view, /Опубликовано:/);
assert.doesNotMatch(view, /Обновлено:/);
assert.doesNotMatch(view, /ArticleBylineDates/);
assert.doesNotMatch(view, /resolveArticleVisibleDates/);
assert.doesNotMatch(view, /visible-dates/);
assert.match(view, /authorLabel/);
assert.match(view, /readingTimeLabel|readingTimeMinutes/);
assert.equal((view.match(/function CreatorPathsArticlePageView|function Creator/g) || []).length >= 1, true);
assert.match(view, /function PracticeArticlePageView|PracticeArticle/);

assert.equal(existsSync(join(root, "src/lib/seo/articles/visible-dates.ts")), false);

const jsonLdSource = read("src/lib/seo/articles/json-ld.ts");
assert.doesNotMatch(jsonLdSource, /datePublished/);
assert.doesNotMatch(jsonLdSource, /dateModified/);

const practice = articles.find((a) => a.productContinuation.kind === "practice");
const creator = articles.find((a) => a.productContinuation.kind === "creator_paths");
assert.ok(practice);
assert.ok(creator);

function buildMinimalPageData(article) {
  const path = `/articles/${article.slug}`;
  const base = {
    article,
    path,
    canonicalUrl: `https://audiolad.ru${path}`,
    readingTimeMinutes: 8,
  };
  if (article.productContinuation.kind === "practice") {
    return {
      ...base,
      primaryPractice: {
        id: "practice-id",
        coverUrl: null,
        authorSlug: "author",
        slug: "practice",
        title: "Practice",
        price: 0,
        format: "audio",
      },
      relatedPractices: [],
      libraryAction: "hidden",
    };
  }
  return base;
}

for (const article of [practice, creator]) {
  const node = buildArticleJsonLd(buildMinimalPageData(article), "https://audiolad.ru");
  assert.equal(node["@type"], "Article");
  assert.equal(Object.hasOwn(node, "datePublished"), false, article.slug);
  assert.equal(Object.hasOwn(node, "dateModified"), false, article.slug);
  assert.ok(node.headline);
  assert.ok(node.description);
  assert.ok(node.author);
  assert.ok(node.publisher);
  assert.ok(node.mainEntityOfPage);
  assert.ok(node.about);
  // technical timestamps remain on the definition
  assert.ok(article.publishedAt);
  assert.ok(article.updatedAt);
}

const sitemap = mapArticleDefinitionsToSitemapEntries();
assert.equal(sitemap.length, 103);
const sample = sitemap.find((entry) => String(entry.url).includes(practice.slug));
assert.ok(sample?.lastModified, "sitemap lastModified kept from updatedAt/publishedAt");

// Every registered article still has editorial timestamps (not wiped from content files)
for (const article of articles) {
  assert.ok(article.publishedAt, `${article.slug} publishedAt`);
  assert.ok(article.updatedAt, `${article.slug} updatedAt`);
}

console.log("articles-evergreen-dates-unit: ok");
