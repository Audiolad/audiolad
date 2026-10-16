// Task 8d9cd0af: consent checkboxes link to readable program documents in a new tab, without toggling.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as consentLinkModule from "../src/components/author-dashboard/business/ConsentDocumentLink";
import * as formModule from "../src/components/author-dashboard/business/RightsholderVerificationForm";
import * as markdownModule from "../src/components/legal/SimpleMarkdown";
import {
  documentEditionLabel,
  PUBLIC_PROGRAM_DOCUMENTS,
} from "../src/lib/business-rightsholder/program-documents";

// tsx ESM↔CJS interop: default export may arrive wrapped once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (m: any): any => (typeof m.default === "function" ? m.default : m.default?.default);
const ConsentDocumentLink = unwrap(consentLinkModule);
const RightsholderVerificationForm = unwrap(formModule);
const SimpleMarkdown = unwrap(markdownModule);

const terms = PUBLIC_PROGRAM_DOCUMENTS.business_program_terms;
const rights = PUBLIC_PROGRAM_DOCUMENTS.business_music_rights_declaration;
assert.equal(terms.path, "/business-documents/program-terms");
assert.equal(rights.path, "/business-documents/music-rights-declaration");
assert.equal(documentEditionLabel(terms), "Редакция от 14.10.2026, черновик");
assert.equal(documentEditionLabel({ date: "2026-11-01", status: "approved" }), "Редакция от 01.11.2026");
assert.match(terms.markdown, /УСЛОВИЯ ЛИЦЕНЗИРОВАНИЯ МУЗЫКИ ДЛЯ БИЗНЕСА/);
assert.match(rights.markdown, /ДЕКЛАРАЦИЯ ПРАВООБЛАДАТЕЛЯ/);

function anchors(html: string) {
  return [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
}
function assertNewTab(tag: string) {
  assert.match(tag, /\starget="_blank"/, tag);
  const rel = /\srel="([^"]*)"/.exec(tag)?.[1] ?? "";
  assert.ok(rel.split(/\s+/).includes("noopener"), `rel must include noopener: ${tag}`);
}

// Fallback (no published DB version): static page + draft label.
const link = renderToStaticMarkup(createElement(ConsentDocumentLink, { documentKey: "business_program_terms" }, "условия"));
assertNewTab(anchors(link)[0]);
assert.match(link, /href="\/business-documents\/program-terms"/);
assert.match(link, /Редакция от 14\.10\.2026, черновик/);
// DB-published version: shows the version that the consent row will record.
const dbLink = renderToStaticMarkup(createElement(ConsentDocumentLink, { documentKey: "business_music_rights_declaration", dbVersion: "v1", dbUrl: "https://audiolad.ru/x" }, "заявление"));
assertNewTab(anchors(dbLink)[0]);
assert.match(dbLink, /href="https:\/\/audiolad\.ru\/x"/);
assert.match(dbLink, /редакция v1/);

// Full form: both checkbox texts link out, and no <a> sits inside a <label> (clicking it cannot toggle).
const html = renderToStaticMarkup(createElement(RightsholderVerificationForm, {
  products: [{ id: "p1", title: "Альбом", tracks: [{ id: "t1", title: "Трек" }] }],
  documents: [],
  existing: null,
}));
const docLinks = anchors(html).filter((a) => a.includes("data-consent-doc"));
assert.equal(docLinks.length, 2);
docLinks.forEach(assertNewTab);
assert.ok(html.includes('href="/business-documents/program-terms"'));
assert.ok(html.includes('href="/business-documents/music-rights-declaration"'));
assert.match(html, /Я принимаю<\/label> <a[^>]*>условия программы АудиоЛад Бизнес<\/a>/);
assert.match(html, /Я подтверждаю<\/label> <a[^>]*>заявление о правах на музыку<\/a>/);
for (const label of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) {
  assert.doesNotMatch(label[1], /<a\b/, "link must not be nested in a <label>");
}
assert.match(html, /<label for="rightsholder-accept-terms">/);
assert.match(html, /id="rightsholder-accept-terms" type="checkbox"/);

// Link click handler stops propagation.
const src = readFileSync("src/components/author-dashboard/business/ConsentDocumentLink.tsx", "utf8");
assert.match(src, /event\.stopPropagation\(\)/);

// Markdown renderer: escapes HTML, renders structure.
const md = renderToStaticMarkup(createElement(SimpleMarkdown, { source: "# T\n\n> note **b**\n\n1. one\n2. <script>x</script>\n\n| a | b |\n|---|---|\n| 1 | 2 |" }));
assert.match(md, /<h1[^>]*>T<\/h1>/);
assert.match(md, /<strong>b<\/strong>/);
assert.match(md, /&lt;script&gt;/);
assert.match(md, /<td[^>]*>2<\/td>/);
console.log("business-consent-document-links-unit: ok");
