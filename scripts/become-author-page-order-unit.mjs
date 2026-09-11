#!/usr/bin/env node
/**
 * /become-author: two-level CTA — short top button, then full panel, then School.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

const page = read("src/app/(platform)/become-author/page.tsx");
const content = read("src/components/become-author/BecomeAuthorContent.tsx");
const panel = read("src/components/become-author/AuthorApplicationPanel.tsx");
const loading = read("src/app/(platform)/become-author/loading.tsx");

assert.match(page, /BecomeAuthorHero/);
assert.match(page, /BecomeAuthorTopCta/);
assert.match(page, /BecomeAuthorInfoSections/);
assert.match(page, /AuthorApplicationPanel/);
assert.match(page, /BecomeAuthorSchoolSection/);
assert.match(page, /AUTHOR_APPLICATION_PANEL_ID/);
assert.match(page, /id=\{AUTHOR_APPLICATION_PANEL_ID\}/);

const heroIdx = page.indexOf("<BecomeAuthorHero");
const topCtaIdx = page.indexOf("<BecomeAuthorTopCta");
const infoIdx = page.indexOf("<BecomeAuthorInfoSections");
const panelIdx = page.indexOf("<AuthorApplicationPanel");
const schoolIdx = page.indexOf("<BecomeAuthorSchoolSection");

assert.ok(
  heroIdx > -1 &&
    topCtaIdx > -1 &&
    infoIdx > -1 &&
    panelIdx > -1 &&
    schoolIdx > -1,
);
assert.ok(heroIdx < topCtaIdx, "hero comes before top CTA");
assert.ok(topCtaIdx < infoIdx, "top CTA comes before informational sections");
assert.ok(infoIdx < panelIdx, "informational sections come before full panel");
assert.ok(panelIdx < schoolIdx, "full panel comes before School");

assert.equal(
  countMatches(page, /<AuthorApplicationPanel/g),
  1,
  "full application panel appears exactly once",
);

assert.doesNotMatch(page, /order-1/);
assert.doesNotMatch(page, /order-2/);
assert.doesNotMatch(page, /order-3/);
assert.doesNotMatch(page, /order-4/);
assert.match(
  page,
  /lg:grid lg:grid-cols-\[minmax\(0,3fr\)_minmax\(320px,2fr\)\]/,
);
assert.match(page, /lg:col-span-2/);
assert.match(page, /lg:self-start/);

const infoFn = content.slice(
  content.indexOf("export function BecomeAuthorInfoSections"),
  content.indexOf("export function BecomeAuthorSchoolSection"),
);
assert.match(infoFn, /become-author-fit-heading/);
assert.match(infoFn, /become-author-formats-heading/);
assert.match(infoFn, /become-author-benefits-heading/);
assert.match(infoFn, /become-author-path-heading/);
assert.match(infoFn, /become-author-levels-heading/);
assert.doesNotMatch(
  infoFn,
  /become-author-training-heading/,
  "School must not live inside the explaining-info block",
);
assert.doesNotMatch(infoFn, /school\.audiolad\.ru/);

assert.match(content, /export const AUTHOR_APPLICATION_PANEL_ID = "author-application-panel"/);
assert.match(content, /export function BecomeAuthorTopCta/);
assert.match(content, /href=\{`#\$\{AUTHOR_APPLICATION_PANEL_ID\}`\}/);
assert.match(content, /Стать автором/);
assert.match(content, /audience === "author"/);
assert.match(
  content.slice(
    content.indexOf("export function BecomeAuthorTopCta"),
    content.indexOf("export function BecomeAuthorInfoSections"),
  ),
  /return null/,
);

assert.match(content, /export function BecomeAuthorSchoolSection/);
assert.match(content, /Нужна помощь с созданием аудиопрактик\?/);
assert.match(content, /Школа Аудиопрактик/);
assert.match(content, /href="https:\/\/school\.audiolad\.ru\/"/);

assert.match(panel, /Начать путь автора/);
assert.match(panel, /Зарегистрироваться и подать заявку/);
assert.match(panel, /Уже есть аккаунт/);
assert.match(panel, /buildAuthRouteHref\("\/auth\/sign-up", "\/become-author"\)/);
assert.match(panel, /buildAuthRouteHref\("\/auth\/sign-in", "\/become-author"\)/);
assert.match(panel, /Заявка автора/);
assert.doesNotMatch(panel, /id="author-application-panel"/);

assert.doesNotMatch(loading, /order-1/);
assert.doesNotMatch(loading, /order-2/);
assert.doesNotMatch(loading, /order-3/);
assert.match(loading, /lg:grid lg:grid-cols-\[minmax\(0,3fr\)_minmax\(320px,2fr\)\]/);

console.log("become-author-page-order-unit: ok");
