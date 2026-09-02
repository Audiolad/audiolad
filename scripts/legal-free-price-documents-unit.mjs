#!/usr/bin/env node
/**
 * Guards the legal-document update for listener-determined product price.
 * Does not cover payments, GetCourse, or Author Support UI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LEGAL_LINKS } from "../src/lib/legal/links.ts";
import { AUTHOR_TERMS_APPROVED_TEXT } from "../src/lib/author-terms/approved-content.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const offer = read("src/app/(platform)/offer/page.tsx");
assert.ok(!offer.includes(EM_DASH), "offer must not use em-dash");
assert.ok(offer.includes(EN_DASH), "offer keeps en-dash");
assert.ok(
  offer.includes(
    "о продаже цифровых аудиопродуктов и предоставлении доступа к авторским аудиоматериалам на сайте «АудиоЛад»",
  ),
);
assert.ok(offer.includes("Последнее обновление: 2 сентября 2026 года"));
assert.ok(
  offer.includes(
    "заключении договора в отношении цифровых аудиопродуктов и",
  ),
);
assert.ok(offer.includes("Доступ к цифровым аудиопродуктам может быть"));
assert.ok(offer.includes("Продукт со свободной стоимостью"));
assert.ok(offer.includes("Свободная оплата"));
assert.ok(offer.includes("Поблагодарить автора"));
assert.ok(
  offer.includes(
    "не является обозначением благотворительного пожертвования",
  ),
);
assert.ok(offer.includes("<strong className=\"font-semibold text-[#25135c]\">3.4.</strong>"));
assert.ok(offer.includes("<strong className=\"font-semibold text-[#25135c]\">3.5.</strong>"));
assert.ok(offer.includes("<strong className=\"font-semibold text-[#25135c]\">4.4.</strong>"));
assert.ok(offer.includes("<strong className=\"font-semibold text-[#25135c]\">5.5.</strong>"));
assert.ok(offer.includes("<strong className=\"font-semibold text-[#25135c]\">5.6.</strong>"));
assert.ok(offer.includes("<strong className=\"font-semibold text-[#25135c]\">5.7.</strong>"));
assert.ok(offer.includes("<strong className=\"font-semibold text-[#25135c]\">6.7.</strong>"));
assert.ok(offer.includes('id="section-1"'));
assert.ok(offer.includes('id="section-private-audio"'));
assert.ok(offer.includes("Личные аудиоматериалы пользователя"));
assert.ok(offer.includes("ИНН"));
assert.ok(offer.includes("507305817690"));
assert.ok(!offer.includes("GetCourse"));

const terms = read("src/lib/author-terms/approved-content.ts");
assert.ok(!AUTHOR_TERMS_APPROVED_TEXT.includes(EM_DASH), "author terms must not use em-dash");
assert.ok(AUTHOR_TERMS_APPROVED_TEXT.includes(EN_DASH), "author terms keep en-dash");
assert.ok(terms.includes('version: "1.1"'));
assert.ok(terms.includes("2026-09-02T00:00:00+03:00"));
assert.ok(terms.includes("7.5. Платёж со стоимостью, самостоятельно определяемой слушателем"));
assert.ok(terms.includes("6.4. Коммерческие условия и индивидуальные параметры Автора применяются также к платежам слушателей"));

const footer = read("src/lib/legal/links.ts");
assert.deepEqual(
  LEGAL_LINKS.map((item) => item.href),
  [
    "/requisites",
    "/offer",
    "/author-terms",
    "/privacy",
    "/consent",
    "/payment-and-refund",
  ],
);
assert.ok(footer.includes('href: "/offer"'));
assert.ok(footer.includes('href: "/author-terms"'));

const page = read("src/app/(platform)/author-terms/page.tsx");
assert.ok(page.includes("Версия: {meta.version}"));
assert.ok(page.includes("Дата публикации:"));
assert.ok(page.includes("Дата вступления в силу:"));
assert.ok(page.includes("href={`#${item.id}`}"));

console.log("legal-free-price-documents-unit: ok");
