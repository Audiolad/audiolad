#!/usr/bin/env node
// Sergey rule (23.10.2026): article content has NO outgoing links to other websites.
// Allowed: relative links (/path, #anchor) and absolute links to audiolad.ru, sergey-zoya.ru
// (and their subdomains). Sources may be named in plain text, but not linked.
// Scans every string of every registered article definition: href-like fields must be allowed,
// and bare URLs inside visible text are not allowed either. No DB, no network.
import assert from "node:assert/strict";

import { listArticleDefinitions } from "../src/lib/seo/articles";

const ALLOWED_HOSTS = ["audiolad.ru", "sergey-zoya.ru"];
const HREF_KEY_RE = /^(href|titleHref|topicHref)$/;
const BARE_URL_RE = /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.)[^\s"'<>)»]+/gi;

export function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return ALLOWED_HOSTS.some((a) => h === a || h.endsWith(`.${a}`));
}

export function isAllowedHref(href: string): boolean {
  const v = href.trim();
  if (v.startsWith("#")) return true;
  if (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\")) return true;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return false;
  }
  return (url.protocol === "https:" || url.protocol === "http:") && isAllowedHost(url.hostname);
}

export function externalUrlsInText(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(BARE_URL_RE)) {
    const raw = m[0];
    const candidate = raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;
    if (!isAllowedHref(candidate)) found.push(raw);
  }
  return found;
}

export function findExternalLinks(doc: unknown): { path: string; value: string }[] {
  const hits: { path: string; value: string }[] = [];
  const walk = (value: unknown, path: string, key: string) => {
    if (typeof value === "string") {
      if (HREF_KEY_RE.test(key)) {
        if (!isAllowedHref(value)) hits.push({ path, value });
      } else {
        for (const url of externalUrlsInText(value)) hits.push({ path, value: url });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`, key));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, k);
    }
  };
  walk(doc, "", "");
  return hits;
}

// Classifier self-checks.
assert.equal(isAllowedHref("/articles/x"), true);
assert.equal(isAllowedHref("#section"), true);
assert.equal(isAllowedHref("https://audiolad.ru/catalog"), true);
assert.equal(isAllowedHref("https://school.audiolad.ru/"), true);
assert.equal(isAllowedHref("https://sergey-zoya.ru/s/abc"), true);
assert.equal(isAllowedHref("https://azbyka.ru/molitvoslov/molitva-angelu-xranitelyu.html"), false);
assert.equal(isAllowedHref("//azbyka.ru/x"), false);
assert.equal(isAllowedHref("https://audiolad.ru.evil.example/"), false);
assert.equal(isAllowedHref("https://notaudiolad.ru/"), false);
assert.equal(isAllowedHref("mailto:someone@example.com"), false);
assert.equal(isAllowedHref("javascript:alert(1)"), false);
assert.deepEqual(externalUrlsInText("Текст со ссылкой https://azbyka.ru/x и www.example.com."), [
  "https://azbyka.ru/x",
  "www.example.com.",
]);
assert.deepEqual(externalUrlsInText("Источник – сайт «Азбука веры»; см. https://audiolad.ru/articles"), []);
assert.equal(
  findExternalLinks({ sections: [{ blocks: [{ kind: "rich_paragraph", segments: [{ href: "https://azbyka.ru/", label: "x" }] }] }] }).length,
  1,
);

// Real registry.
const articles = listArticleDefinitions();
assert.ok(articles.length > 0, "article registry is empty");
const failures: string[] = [];
for (const article of articles) {
  for (const hit of findExternalLinks(article)) failures.push(`${article.slug}: ${hit.path} -> ${hit.value}`);
}
assert.equal(
  failures.length,
  0,
  `External links are not allowed in article content (owner rule 23.10.2026):\n${failures.join("\n")}`,
);

console.log(`articles-no-external-links: ${articles.length} articles, 0 external links`);
