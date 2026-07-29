#!/usr/bin/env node
/**
 * Unit checks for /for-authors product landing – no DB / network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FOR_AUTHORS_FAQ,
  FOR_AUTHORS_PAGE_H1,
  FOR_AUTHORS_PATH,
  FOR_AUTHORS_SEO_DESCRIPTION,
  FOR_AUTHORS_SEO_TITLE,
} from "../src/lib/seo/for-authors/content.ts";
import { buildForAuthorsPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import {
  buildForAuthorsMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";
import { STATIC_SITEMAP_PAGES } from "../src/lib/seo/sitemap-data.ts";
import { PUBLIC_FOOTER_LINKS } from "../src/lib/navigation/public-footer-links.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";

const ORIGIN = "https://audiolad.ru";

function read(path) {
  return readFileSync(path, "utf8");
}

function testMetadata() {
  const metadata = buildForAuthorsMetadata();
  assert.equal(metadata.title, FOR_AUTHORS_SEO_TITLE);
  assert.equal(metadata.description, FOR_AUTHORS_SEO_DESCRIPTION);
  assert.equal(
    metadata.alternates?.canonical,
    buildSiteCanonicalUrl(FOR_AUTHORS_PATH),
  );
  assert.equal(metadata.openGraph?.url, buildSiteCanonicalUrl(FOR_AUTHORS_PATH));
  assert.equal(metadata.openGraph?.type, "website");
  assert.equal(metadata.twitter?.card, "summary");
  assert.equal(FOR_AUTHORS_PAGE_H1, "Платформа для авторов медитаций и аудиопрактик");
}

function testJsonLd() {
  const jsonLd = buildForAuthorsPageJsonLd(
    {
      title: FOR_AUTHORS_PAGE_H1,
      description: FOR_AUTHORS_SEO_DESCRIPTION,
      path: FOR_AUTHORS_PATH,
      faq: FOR_AUTHORS_FAQ.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
    },
    ORIGIN,
  );

  assert.equal(jsonLd["@context"], "https://schema.org");
  const graph = jsonLd["@graph"];
  assert.ok(Array.isArray(graph), "graph is array");

  const types = graph.map((node) => node["@type"]);
  assert.ok(types.includes("Organization"), "Organization present");
  assert.ok(types.includes("WebSite"), "WebSite present");
  assert.ok(types.includes("WebPage"), "WebPage present");
  assert.ok(types.includes("BreadcrumbList"), "BreadcrumbList present");
  assert.ok(types.includes("FAQPage"), "FAQPage present");
  assert.ok(!types.includes("AboutPage"), "not AboutPage");
  assert.ok(!types.includes("Article"), "not Article");
  assert.ok(!types.includes("Course"), "not Course");
  assert.ok(!types.includes("Product"), "not Product");

  const webpage = graph.find((node) => node["@type"] === "WebPage");
  assert.equal(webpage.url, `${ORIGIN}/for-authors`);
  assert.equal(webpage.name, FOR_AUTHORS_PAGE_H1);

  const breadcrumbs = graph.find((node) => node["@type"] === "BreadcrumbList");
  const crumbNames = breadcrumbs.itemListElement.map((item) => item.name);
  assert.deepEqual(crumbNames, ["Главная", "Авторам"]);

  const faq = graph.find((node) => node["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, FOR_AUTHORS_FAQ.length);
  assert.equal(faq.mainEntity[0].name, FOR_AUTHORS_FAQ[0].question);
  assert.equal(
    faq.mainEntity[0].acceptedAnswer.text,
    FOR_AUTHORS_FAQ[0].answer,
  );
}

function testPageContent() {
  const page = read("src/app/(listener)/for-authors/page.tsx");
  assert.match(page, /buildForAuthorsPageJsonLd/);
  assert.match(page, /FOR_AUTHORS_PAGE_H1/);
  assert.match(page, /href="\/become-author"/);
  assert.match(page, /href="\/philosophy"/);
  assert.match(page, /href="\/help\/authors"/);
  assert.match(page, /href="\/author-terms"/);
  assert.match(page, /href="\/authors"/);
  assert.match(page, /#for-authors-capabilities/);
  assert.doesNotMatch(page, /\bCRM\b/);
  assert.doesNotMatch(page, /пассивный доход/);
  assert.doesNotMatch(page, /доступ навсегда/);
  assert.doesNotMatch(page, /маркетплейс/i);
  assert.doesNotMatch(page, /гарантированн/i);
  assert.equal(FOR_AUTHORS_FAQ.length, 12);
}

function testNavigationAndSitemap() {
  assert.equal(
    PUBLIC_FOOTER_LINKS.find((item) => item.href === "/for-authors")?.title,
    "Авторам",
  );
  const aboutIdx = PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/about");
  const philosophyIdx = PUBLIC_FOOTER_LINKS.findIndex(
    (item) => item.href === "/philosophy",
  );
  const forAuthorsIdx = PUBLIC_FOOTER_LINKS.findIndex(
    (item) => item.href === "/for-authors",
  );
  const articlesIdx = PUBLIC_FOOTER_LINKS.findIndex(
    (item) => item.href === "/articles",
  );
  const helpIdx = PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/help");
  assert.ok(
    aboutIdx < philosophyIdx &&
      philosophyIdx < forAuthorsIdx &&
      forAuthorsIdx < articlesIdx &&
      articlesIdx < helpIdx,
    "footer order",
  );

  assert.equal(isBottomNavNeutralPathname("/for-authors"), true);

  const sitemapEntry = STATIC_SITEMAP_PAGES.find(
    (page) => page.path === "/for-authors",
  );
  assert.ok(sitemapEntry, "sitemap includes /for-authors");
  assert.equal(sitemapEntry.changeFrequency, "monthly");
  assert.equal(sitemapEntry.priority, 0.7);
}

function testAboutCtaUpdates() {
  const about = read("src/app/(listener)/about/page.tsx");
  assert.match(about, /href="\/for-authors"/);
  assert.match(about, /href="\/become-author"/);
  assert.match(about, /познакомьтесь с возможностями для авторов/);
  assert.match(about, /подайте заявку/);
}

testMetadata();
testJsonLd();
testPageContent();
testNavigationAndSitemap();
testAboutCtaUpdates();
console.log("for-authors-page-unit: ok");
