#!/usr/bin/env node
/**
 * /become-author: author application path before School, especially on mobile.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const page = read("src/app/(platform)/become-author/page.tsx");
const content = read("src/components/become-author/BecomeAuthorContent.tsx");
const panel = read("src/components/become-author/AuthorApplicationPanel.tsx");
const loading = read("src/app/(platform)/become-author/loading.tsx");

assert.match(page, /BecomeAuthorHero/);
assert.match(page, /AuthorApplicationPanel/);
assert.match(page, /BecomeAuthorInfoSections/);
assert.match(page, /BecomeAuthorSchoolSection/);

const heroIdx = page.indexOf("<BecomeAuthorHero");
const panelIdx = page.indexOf("<AuthorApplicationPanel");
const infoIdx = page.indexOf("<BecomeAuthorInfoSections");
const schoolIdx = page.indexOf("<BecomeAuthorSchoolSection");

assert.ok(heroIdx > -1 && panelIdx > -1 && infoIdx > -1 && schoolIdx > -1);
assert.ok(heroIdx < panelIdx, "hero comes before application panel");
assert.ok(panelIdx < infoIdx, "application panel comes before explaining sections");
assert.ok(infoIdx < schoolIdx, "explaining sections come before School");

assert.match(page, /order-1/);
assert.match(page, /order-2/);
assert.match(page, /order-3/);
assert.match(page, /order-4/);
assert.match(page, /lg:col-start-2 lg:row-start-1 lg:row-span-3/);

const infoFn = content.slice(
  content.indexOf("export function BecomeAuthorInfoSections"),
  content.indexOf("export function BecomeAuthorSchoolSection"),
);
assert.match(infoFn, /become-author-fit-heading/);
assert.doesNotMatch(
  infoFn,
  /become-author-training-heading/,
  "School must not live inside the explaining-info block",
);
assert.doesNotMatch(infoFn, /school\.audiolad\.ru/);

assert.match(content, /export function BecomeAuthorSchoolSection/);
assert.match(content, /Нужна помощь с созданием аудиопрактик\?/);
assert.match(content, /Школа Аудиопрактик/);
assert.match(content, /href="https:\/\/school\.audiolad\.ru\/"/);

assert.match(panel, /Начать путь автора/);
assert.match(panel, /Зарегистрироваться и подать заявку/);
assert.match(panel, /buildAuthRouteHref\("\/auth\/sign-up", "\/become-author"\)/);

assert.match(loading, /order-1/);
assert.match(loading, /order-2/);
assert.match(loading, /order-3/);

console.log("become-author-page-order-unit: ok");
