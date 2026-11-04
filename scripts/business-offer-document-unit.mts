// Stage 1C (Sergey 04.11.2026): the договор-оферта «АудиоЛад Бизнес» is the one document an owner
// accepts. The file, the embedded copy, the hash and the SQL seed must be the same edition.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as pageModule from "../src/app/business-app/documents/business-offer/page";
import { BUSINESS_OFFER_SOURCE } from "../src/lib/business-app/business-offer-content";
import { BUSINESS_OFFER_ANNEX_IDS, businessOfferAnnexes } from "../src/lib/business-app/business-offer-annexes";
import { CLIENT_DOCUMENT_REQUISITES, CLIENT_DOCUMENTS } from "../src/lib/business-app/client-documents";
import { BUSINESS_PUBLIC_PATH_REWRITES } from "../src/lib/business-app/host";
import {
  BUSINESS_OFFER_EDITION,
  BUSINESS_OFFER_HREF,
  BUSINESS_OFFER_TITLE,
  hasAcceptedCurrentBusinessOffer,
  isCurrentBusinessOfferEdition,
} from "../src/lib/business/offer";
import { BUSINESS_GIFT_DAYS, BUSINESS_PAID_PERIOD_DAYS } from "../src/lib/business/plan";

// Same rules as scripts/business-public-documents-text-unit.mts (that file runs on import).
function assertCleanRussian(label: string, text: string) {
  const stripped = text.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, " ");
  const latin = stripped.match(/[^\s]*[A-Za-z][^\s]*/g);
  assert.equal(latin, null, `${label}: Latin text found: ${latin?.slice(0, 10).join(", ")}`);
  assert.doesNotMatch(text, /черновик|юрист|проект|draft|после проверки/i, `${label}: draft/lawyer wording`);
  assert.doesNotMatch(text, /паспорт|355045|355035|Ставрополь|45 Параллель|Дачная/i, `${label}: passport/address must not be published`);
  assert.doesNotMatch(text, /без\s+(РАО|ВОИС)/i, `${label}: no «без РАО/ВОИС» promise`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (m: any): any => (typeof m.default === "function" ? m.default : m.default?.default);
const OfferPage = unwrap(pageModule);

// 1. One edition everywhere: file = embedded copy = hash = SQL seed.
const file = readFileSync(BUSINESS_OFFER_SOURCE.file, "utf8");
assert.equal(BUSINESS_OFFER_SOURCE.markdown, file, "embedded offer differs from docs/business/public/business-offer.md");
const sha = createHash("sha256").update(file, "utf8").digest("hex");
assert.equal(BUSINESS_OFFER_SOURCE.sha256, sha, "offer hash is stale");
assert.equal(BUSINESS_OFFER_EDITION.contentHash, sha, "BUSINESS_OFFER_EDITION hash is stale: new text = new edition");
assert.equal(BUSINESS_OFFER_SOURCE.version, BUSINESS_OFFER_EDITION.version);
const migration = readFileSync("supabase/migrations/20270217120000_business_offer_editions.sql", "utf8");
assert.match(migration, new RegExp(`'${BUSINESS_OFFER_EDITION.version.replace(/\./g, "\\.")}',\\s*'${sha}'`), "SQL seed must carry the same edition");
assert.match(BUSINESS_OFFER_EDITION.label, /^Редакция \d+ от \d{2}\.\d{2}\.\d{4}$/);
assert.equal(BUSINESS_OFFER_HREF, "/documents/business-offer");

// 2. Required content, wording rules.
const text = file;
assert.match(text, new RegExp(`799 ₽ за одну точку на ${BUSINESS_PAID_PERIOD_DAYS} дней`));
assert.match(text, new RegExp(`${BUSINESS_GIFT_DAYS} дней`));
assert.match(text, /Автоматических списаний нет/);
assert.match(text, /начинаются с окончания текущего периода/);
assert.match(text, /завершается вместе с окончанием подарочного или оплаченного периода/);
assert.match(text, /## \d+\. Возврат денежных средств/);
assert.doesNotMatch(text, /—/, "en dash only");
assert.doesNotMatch(text, /https?:\/\/|www\./i, "no external links in the offer");
assert.doesNotMatch(text, /льготн|грейс|дополнительн\S* (\d+ )?(дн|сут)|ещ[её] \d+ (дн|сут)|3 дн|тр[её]х дн/i, "never mention days after the period");
assert.doesNotMatch(text, /офлайн|без интернета/i, "no offline promise");
assertCleanRussian("business-offer.md", text);

// 3. Seller identity only from the approved requisites.
assert.ok(text.includes("Индивидуальный предприниматель Петров Сергей Сергеевич"));
for (const part of CLIENT_DOCUMENT_REQUISITES.match(/\d{12,15}/g) ?? []) assert.ok(text.includes(part), `requisite ${part}`);

// 4. Annexes are the approved documents, unchanged and linked.
assert.equal(BUSINESS_OFFER_ANNEX_IDS.length, 4);
for (const annex of businessOfferAnnexes()) {
  const doc = CLIENT_DOCUMENTS.find((d) => d.id === annex.id);
  assert.ok(doc, annex.id);
  assert.ok(text.includes(`Приложение ${annex.number}`), `annex ${annex.number} named in the text`);
  assert.ok(text.includes(doc.title), `annex title ${doc.title}`);
}
assert.ok(!CLIENT_DOCUMENTS.some((d) => d.id === "business-offer"), "the offer is not one of its own annexes");

// 5. Rendered page: title, edition, requisites, body, annex links, hash attributes.
const html = renderToStaticMarkup(createElement(OfferPage));
assert.match(html, /data-document-id="business-offer"/);
assert.match(html, new RegExp(`data-document-sha256="${sha}"`));
assert.match(html, new RegExp(`data-document-version="${BUSINESS_OFFER_EDITION.version.replace(/\./g, "\\.")}"`));
assert.ok(html.includes(BUSINESS_OFFER_EDITION.label));
assert.equal((html.match(/<h1/g) ?? []).length, 1, "one page title");
assert.ok(html.includes(BUSINESS_OFFER_TITLE.replace(/«/g, "«")));
for (const id of BUSINESS_OFFER_ANNEX_IDS) assert.match(html, new RegExp(`href="/documents/${id}"`));
assert.doesNotMatch(html, /href="https?:/, "no external links on the offer page");
assert.doesNotMatch(html, /—/);
const visible = html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
assertCleanRussian("business-offer page", visible);

// 6. Coffee/business host serves it.
assert.equal(BUSINESS_PUBLIC_PATH_REWRITES["/documents/business-offer"], "/business-app/documents/business-offer");

// 7. Acceptance helpers: only the current edition counts.
assert.equal(isCurrentBusinessOfferEdition(BUSINESS_OFFER_EDITION.version, sha), true);
assert.equal(isCurrentBusinessOfferEdition(BUSINESS_OFFER_EDITION.version, "0".repeat(64)), false);
assert.equal(isCurrentBusinessOfferEdition(undefined, undefined), false);
assert.equal(hasAcceptedCurrentBusinessOffer(null), false);
assert.equal(hasAcceptedCurrentBusinessOffer([{ document_key: "b2b-terms", document_version: "r8-2026-10-18", content_hash: "x" }]), false);
assert.equal(hasAcceptedCurrentBusinessOffer([{ document_key: "business-offer", document_version: "offer-v0", content_hash: sha }]), false);
assert.equal(hasAcceptedCurrentBusinessOffer([{ document_key: "business-offer", document_version: BUSINESS_OFFER_EDITION.version, content_hash: sha }]), true);

// 8. Every accept button links the offer; payment and gift start check the edition server-side.
const guestCta = readFileSync("src/components/business-app/BusinessGuestStartCta.tsx", "utf8");
assert.match(guestCta, /href=\{BUSINESS_OFFER_HREF\}/);
assert.match(guestCta, /offerVersion: BUSINESS_OFFER_EDITION\.version, offerHash: BUSINESS_OFFER_EDITION\.contentHash/);
assert.match(readFileSync("src/app/api/business/guest-start/route.ts", "utf8"), /record_business_offer_edition_acceptance/);
assert.match(readFileSync("src/app/api/business/subscription/accept/route.ts", "utf8"), /accept_business_offer_edition/);
const checkout = readFileSync("src/app/api/business/subscription/checkout/route.ts", "utf8");
assert.ok(checkout.indexOf("hasAcceptedCurrentBusinessOffer(") < checkout.indexOf('rpc("create_business_subscription_order"'), "offer gate before the order");
assert.match(readFileSync("src/lib/business-app/domain.ts", "utf8"), /business_offer_edition_acceptances_for_caller/);

console.log("business-offer-document-unit: ok");
