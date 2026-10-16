// Tasks 8d9cd0af/8dcba9d1 (Sergey 16.10.2026 16:09): client-facing business documents are final Russian texts.
// Scans rendered public document text: no Latin letters (except URLs/emails), no draft/lawyer wording,
// requisites present (ФИО, ИНН, ОГРНИП), never passport or address of the rights-holder.
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as markdownModule from "../src/components/legal/SimpleMarkdown";
import * as detailModule from "../src/app/business-app/documents/[id]/page";
import { CLIENT_DOCUMENT_SOURCES } from "../src/lib/business-app/client-document-content";
import {
  CLIENT_DOCUMENT_EDITION_LABEL,
  CLIENT_DOCUMENT_REQUISITES,
  CLIENT_DOCUMENTS,
} from "../src/lib/business-app/client-documents";
import {
  documentEditionLabel,
  PROGRAM_DOCUMENT_REQUISITES,
  PUBLIC_PROGRAM_DOCUMENTS,
} from "../src/lib/business-rightsholder/program-documents";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (m: any): any => (typeof m.default === "function" ? m.default : m.default?.default);
const SimpleMarkdown = unwrap(markdownModule);
const ClientDocumentPage = unwrap(detailModule);

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

export function assertCleanRussian(label: string, text: string) {
  const stripped = text.replace(/https?:\/\/\S+/g, " ").replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, " ");
  const latin = stripped.match(/[^\s]*[A-Za-z][^\s]*/g);
  assert.equal(latin, null, `${label}: Latin text found: ${latin?.slice(0, 10).join(", ")}`);
  assert.doesNotMatch(text, /черновик|юрист|проект|заключени[ея] юрист|draft|До него текст|после проверки/i, `${label}: draft/lawyer wording`);
  assert.doesNotMatch(text, /паспорт|355045|Ставрополь|45 Параллель/i, `${label}: passport/address must not be published`);
  assert.doesNotMatch(text, /без\s+(РАО|ВОИС)/i, `${label}: no «без РАО/ВОИС» promise`);
  assert.doesNotMatch(text, /^\s*\d{2}\.\s/, `${label}: internal numbering prefix in title`);
}

// audiolad.ru/business-documents/* (and consent links).
for (const doc of Object.values(PUBLIC_PROGRAM_DOCUMENTS)) {
  assert.equal(documentEditionLabel(doc), "Редакция от 16.10.2026");
  const html = renderToStaticMarkup(createElement("article", null,
    createElement("h1", null, doc.title),
    createElement("p", null, documentEditionLabel(doc)),
    createElement("p", null, `${PROGRAM_DOCUMENT_REQUISITES.name} · ИНН ${PROGRAM_DOCUMENT_REQUISITES.inn} · ОГРНИП ${PROGRAM_DOCUMENT_REQUISITES.ogrnip}`),
    createElement(SimpleMarkdown, { source: doc.markdown })));
  const text = visibleText(html);
  assertCleanRussian(doc.path, text);
  assert.match(text, /Петров Сергей Сергеевич/);
  assert.match(text, /507305817690/);
  assert.match(text, /316505300063237/);
  assert.match(doc.markdown, /^# [А-ЯЁ]/);
}

// business.audiolad.ru/documents list copy.
const listCopy = CLIENT_DOCUMENTS.map((d) => `${d.title} ${d.summary}`).join(" ") + ` ${CLIENT_DOCUMENT_EDITION_LABEL} ${CLIENT_DOCUMENT_REQUISITES}`;
assertCleanRussian("/documents list", listCopy);

// business.audiolad.ru/documents/<id> — render the real server page.
for (const d of CLIENT_DOCUMENTS) {
  assert.ok(CLIENT_DOCUMENT_SOURCES[d.id], d.id);
  const el = await ClientDocumentPage({ params: Promise.resolve({ id: d.id }) });
  const text = visibleText(renderToStaticMarkup(el));
  assertCleanRussian(`/documents/${d.id}`, text);
  assert.match(text, /Редакция от 16\.10\.2026/);
  assert.match(text, /ИНН 507305817690/);
  assert.match(text, /ОГРНИП 316505300063237/);
  assert.ok(text.length > 800, `${d.id}: full text`);
}
console.log("business-public-documents-text-unit: ok");
