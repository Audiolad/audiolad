// In-app offer sheet: the payment, profile and guest-start offer links open the accepted
// edition over the current screen instead of a new standalone PWA window (owner report 05.11).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BusinessOfferDocumentLink, BusinessOfferDocumentSheet } from "../src/components/business-app/BusinessOfferDocumentLink";
import { BUSINESS_OFFER_SOURCE } from "../src/lib/business-app/business-offer-content";
import { BUSINESS_OFFER_EDITION, BUSINESS_OFFER_HREF, BUSINESS_OFFER_TITLE } from "../src/lib/business/offer";

// The sheet shows exactly the edition every «Принять» records.
assert.equal(BUSINESS_OFFER_SOURCE.version, BUSINESS_OFFER_EDITION.version);
assert.equal(BUSINESS_OFFER_SOURCE.sha256, BUSINESS_OFFER_EDITION.contentHash);

const link = renderToStaticMarkup(h(BusinessOfferDocumentLink, { testId: "t-offer" }));
assert.match(link, new RegExp(`^<a href="${BUSINESS_OFFER_HREF}"`));
assert.doesNotMatch(link, /target=/);
assert.match(link, /aria-haspopup="dialog"/);
assert.match(link, new RegExp(`data-offer-version="${BUSINESS_OFFER_EDITION.version}"`));
assert.match(link, new RegExp(`>${BUSINESS_OFFER_TITLE}</a>$`));

const sheet = renderToStaticMarkup(h(BusinessOfferDocumentSheet, { onClose() {}, initialSource: BUSINESS_OFFER_SOURCE }));
assert.match(sheet, /role="dialog"/);
assert.match(sheet, /aria-modal="true"/);
assert.match(sheet, new RegExp(`data-document-version="${BUSINESS_OFFER_EDITION.version}"`));
assert.match(sheet, new RegExp(`data-document-sha256="${BUSINESS_OFFER_EDITION.contentHash}"`));
assert.match(sheet, new RegExp(BUSINESS_OFFER_EDITION.label));
assert.match(sheet, /data-testid="biz-offer-sheet-close"[^>]*>Закрыть</);
assert.match(sheet, /business-app-btn-secondary[^"]*"[^>]*data-testid="biz-offer-sheet-done"[^>]*>Закрыть</);
assert.doesNotMatch(sheet, /business-app-btn-primary/, "the sheet adds no competing main CTA");
assert.match(sheet, /Стоимость доступа – <strong>799 ₽ за одну точку на 30 дней<\/strong>/);
assert.doesNotMatch(sheet, /—/, "en dash only");
assert.doesNotMatch(sheet, /<h1/);

// Loading state never shows a different text.
const loading = renderToStaticMarkup(h(BusinessOfferDocumentSheet, { onClose() {} }));
assert.match(loading, /aria-busy="true"/);

// Source guards: no new-tab offer link left on payment, profile and guest-start screens.
for (const file of [
  "src/components/business-app/BusinessHomeAccessCard.tsx",
  "src/components/business-app/BusinessGuestStartCta.tsx",
  "src/components/business-app/BusinessOfferDocumentLink.tsx",
]) {
  const src = readFileSync(file, "utf8");
  assert.doesNotMatch(src, /href=\{BUSINESS_OFFER_HREF\}[^>]*target="_blank"/, file);
  assert.doesNotMatch(src, /новой вкладке/, file);
  assert.doesNotMatch(src, /—/, `${file}: en dash only`);
}
const sheetSrc = readFileSync("src/components/business-app/BusinessOfferDocumentLink.tsx", "utf8");
assert.match(sheetSrc, /createPortal\(/);
assert.match(sheetSrc, /event\.preventDefault\(\)/);
assert.doesNotMatch(sheetSrc, /window\.open|router\.push|location\.(assign|href)/, "no navigation: form state and music stay");

console.log("business-offer-document-sheet-unit: ok");
