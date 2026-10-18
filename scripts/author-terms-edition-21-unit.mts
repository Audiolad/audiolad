#!/usr/bin/env node
// 8d9cd0af: edition 2.1 of the unified agreement (Sergey 18.10.2026 20:57 MSK, option A: a new row,
// 2.0 kept and continuing, explicit acceptance of 2.1). Text, registry, inertness and gate checks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAuthorTermsDocumentBlocks } from "../src/lib/author-terms/document-view";
import {
  APPROVED_AUTHOR_TERMS_EDITIONS,
  LEGACY_AUTHOR_TERMS_EDITION,
  UNIFIED_AUTHOR_TERMS_EDITION,
  UNIFIED_AUTHOR_TERMS_EDITION_V21,
  evaluateTermsGate,
  findAcceptableEditionByHash,
  findEditionByVersion,
  findPublishedEditionByVersion,
} from "../src/lib/author-terms/editions";
import { AUTHOR_TERMS_V2_META, AUTHOR_TERMS_V2_TEXT } from "../src/lib/author-terms/approved-content-v2";
import { AUTHOR_TERMS_V21_META, AUTHOR_TERMS_V21_TEXT, AUTHOR_TERMS_V21_TOC } from "../src/lib/author-terms/approved-content-v21";
import {
  UNIFIED_AGREEMENT_ACCEPTANCE_TEXT,
  UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED,
  UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS,
  unifiedAgreementAcceptanceText,
} from "../src/lib/author-terms/unified-agreement-texts";
import { resolveAuthorTermsNotice } from "../src/lib/author-terms/terms-notice";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

// ---- Text: single source, hash-pinned, en dash only, exactly the approved changes vs 2.0.
const T = AUTHOR_TERMS_V21_TEXT;
assert.equal(T, read("docs/legal/author-agreement/edition-2.1.txt"), "code text = docs text");
assert.equal(sha(T), AUTHOR_TERMS_V21_META.contentHash);
assert.equal(AUTHOR_TERMS_V21_META.version, "2.1");
assert.equal(AUTHOR_TERMS_V21_META.coversBusiness, true);
assert.notEqual(AUTHOR_TERMS_V21_META.versionId, AUTHOR_TERMS_V2_META.versionId, "new row");
assert.equal(sha(AUTHOR_TERMS_V2_TEXT), AUTHOR_TERMS_V2_META.contentHash, "2.0 text untouched");
assert.ok(!T.includes("\u2014"), "2.1: en dash only");
assert.ok(!T.includes("\uFFFD"), "no broken characters");
assert.match(T.split("\n")[2], /редакция 2\.1$/);
for (const forbidden of ["40802810", "БИК", "Корреспондентский", "паспорт"]) assert.ok(!T.includes(forbidden), forbidden);
for (const line of T.split("\n")) {
  assert.ok((line.match(/(^|\s)\d+\.\d+\.\s/g) ?? []).length <= 1, `one clause per line: ${line.slice(0, 60)}`);
}
// Changed lines vs 2.0: header, acceptance paragraph, 1.7, 6.4, 8.1 bullet 3, 8.2, 8.3, 8.7, 8.8, 8.9 (+1 bullet),
// 8.10, 16.3 bullet 1, 28.2 – nothing else.
{
  const a = AUTHOR_TERMS_V2_TEXT.split("\n");
  const b = T.split("\n");
  assert.equal(b.length, a.length + 1, "8.9 gets one more bullet");
  const at89 = b.findIndex((l) => l.startsWith("• Оператор не допустил трек"));
  const bb = [...b.slice(0, at89), ...b.slice(at89 + 1)];
  const changed = a.map((l, i) => (l === bb[i] ? null : bb[i].slice(0, 12))).filter(Boolean);
  assert.deepEqual(changed, [
    "Авторские ус", "Соглашение п", "1.7. Допуск ", "6.4. После п", "• передавать", "8.2. Операто", "8.3. Не разр",
    "8.7. После п", "8.8. Проверк", "• права на т", "8.10. Исключ", "• сублицензи", "28.2. Принят",
  ]);
}
for (const needle of [
  "Принятие владельцем учётной записи распространяется на все кабинеты автора (в том числе псевдонимы)",
  "1.7. Допуск трека – включение конкретного трека в «АудиоЛад Бизнес».",
  "6.4. После подтверждения проверки прав (раздел 8) Соглашение распространяется в «АудиоЛад Бизнес» на все пригодные треки Автора – уже опубликованные и будущие – без отдельного согласия и без проверки каждого трека.",
  "временно хранить в защищённом кэше плеера в порядке пункта 8.2;",
  "8.2. Оператор вправе предоставить заведению режим работы плеера АудиоЛад без подключения к сети.",
  "Автор даёт согласие на такой режим.",
  "8.3. Не разрешаются: скачивание, извлечение или выгрузка файлов, в том числе из кэша плеера,",
  "без проверки каждого трека и без отдельного включения по альбомам или Продуктам.",
  "8.8. Проверка прав проводится один раз по треку, выбранному Автором,",
  "• права на трек отозваны, оспорены или срок их действия истёк;",
  "• Оператор не допустил трек по результатам проверки обращения или претензии;",
  "8.10. Исключения отдельных треков, запросы доказательств и ограничения фиксируются в реестре прав",
  "а если плеер работает без связи (пункт 8.2) – удаляется из кэша при ближайшем подключении;",
  "и редактор кабинета не могут принять Соглашение за Автора.",
]) {
  assert.ok(T.includes(needle), `2.1 contains: ${needle.slice(0, 50)}`);
}
for (const gone of ["Работа без подключения к сети и сохранение треков на устройстве заведения не предоставляются", "Допуск принимается по каждому треку отдельно", "не подтверждает права на остальные треки"]) {
  assert.ok(!T.includes(gone), `2.1 drops: ${gone}`);
}
// Rendering: same structure (29 sections), 2.1 front matter marker.
const blocks = buildAuthorTermsDocumentBlocks(T, UNIFIED_AUTHOR_TERMS_EDITION_V21.frontMatterMarker);
assert.ok(blocks[0].type === "paragraph" && blocks[0].text.startsWith("Настоящее Единое коммерческое соглашение"));
assert.deepEqual(blocks.filter((x) => x.type === "heading").map((h) => h.id), AUTHOR_TERMS_V21_TOC.map((t) => t.id));
assert.equal(AUTHOR_TERMS_V21_TOC.length, 29);

// ---- Registry: 2.1 accepted only with the flag, by its hash; dates from the DB (null in code).
assert.equal(APPROVED_AUTHOR_TERMS_EDITIONS.length, 3);
assert.equal(UNIFIED_AUTHOR_TERMS_EDITION.version, "2.0", "UNIFIED_AUTHOR_TERMS_EDITION stays 2.0");
assert.equal(findAcceptableEditionByHash(AUTHOR_TERMS_V21_META.contentHash, true), UNIFIED_AUTHOR_TERMS_EDITION_V21);
assert.equal(findAcceptableEditionByHash(AUTHOR_TERMS_V21_META.contentHash, false), null, "flag off rejects 2.1");
assert.equal(findEditionByVersion("2.1"), UNIFIED_AUTHOR_TERMS_EDITION_V21);
assert.equal(UNIFIED_AUTHOR_TERMS_EDITION_V21.publishedAt, null);
assert.equal(UNIFIED_AUTHOR_TERMS_EDITION_V21.effectiveAt, null);
// Inert until sql/04: /author-terms?edition=2.1 resolves only when the DB holds the 2.1 hash.
const dbNow = [LEGACY_AUTHOR_TERMS_EDITION.contentHash, AUTHOR_TERMS_V2_META.contentHash];
assert.equal(findPublishedEditionByVersion("2.1", dbNow), null, "2.1 invisible before the insert");
assert.equal(findPublishedEditionByVersion("2.0", dbNow), UNIFIED_AUTHOR_TERMS_EDITION);
assert.equal(findPublishedEditionByVersion("1.2", dbNow), LEGACY_AUTHOR_TERMS_EDITION);
assert.equal(findPublishedEditionByVersion("2.1", [...dbNow, AUTHOR_TERMS_V21_META.contentHash]), UNIFIED_AUTHOR_TERMS_EDITION_V21);
assert.equal(findPublishedEditionByVersion("9.9", dbNow), null);
const page = read("src/app/(platform)/author-terms/page.tsx");
assert.match(page, /findPublishedEditionByVersion\(requestedVersion, dbHashes\)/);
assert.doesNotMatch(page, /findEditionByVersion\(/, "page never opens a code-only edition");
assert.match(page, /\.kind === "dated"/, "a pending newer edition is never listed");

// ---- Acceptance texts: 2.0 frozen (historical record), 2.1 names the new use, en dash only; one source.
assert.equal(UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS["2.0"].first, UNIFIED_AGREEMENT_ACCEPTANCE_TEXT);
assert.equal(UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS["2.0"].updated, UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED);
assert.equal(sha(UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED).length, 64);
for (const t of Object.values(UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS["2.1"])) {
  assert.ok(!t.includes("\u2014"), "2.1 checkbox: en dash only");
  assert.match(t, /2\.1/);
  assert.match(t, /без подключения к сети/);
}
assert.equal(UNIFIED_AUTHOR_TERMS_EDITION_V21.acceptanceText, UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS["2.1"].first);
assert.equal(UNIFIED_AUTHOR_TERMS_EDITION_V21.acceptanceTextUpdated, UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS["2.1"].updated);
assert.equal(UNIFIED_AUTHOR_TERMS_EDITION.acceptanceText, UNIFIED_AGREEMENT_ACCEPTANCE_TEXT, "2.0 server text unchanged");
assert.equal(unifiedAgreementAcceptanceText("2.1", "updated"), UNIFIED_AGREEMENT_ACCEPTANCE_TEXTS["2.1"].updated);
assert.equal(unifiedAgreementAcceptanceText("2.0", "first"), UNIFIED_AGREEMENT_ACCEPTANCE_TEXT);
assert.equal(unifiedAgreementAcceptanceText(undefined, "first"), UNIFIED_AGREEMENT_ACCEPTANCE_TEXT, "unknown: previous behaviour");
const panel = read("src/components/author-dashboard/AuthorTermsAcceptPanel.tsx");
assert.match(panel, /unifiedAgreementAcceptanceText\(version\?\.version, mode\)/, "panel shows the text of the edition it submits");

// ---- Gate when 2.1 is current: a 2.0 acceptor keeps everything (2.0 continues) and gets an invitation only.
const cur21 = { id: "v21", coversBusiness: true };
const on20 = [
  { termsVersionId: "v12", coversBusiness: false, keepsCommercialAccess: true },
  { termsVersionId: "v20", coversBusiness: true, keepsCommercialAccess: true },
];
const g = evaluateTermsGate({ unifiedEnabled: true, now: new Date(), current: cur21, acceptances: on20 });
assert.deepEqual(g, { accepted: true, acceptedCurrent: false, previousEditionActive: true, reacceptInvited: true, businessAgreement: true });
assert.equal(resolveAuthorTermsNotice({ currentVersion: { id: "v21", version: "2.1" } as never, acceptedCurrent: false, previousEditionActive: true, reacceptInvited: true }), "invite");
// Without the 2.0 flag the 2.0 acceptor would lose Business: that is why 05 sets it.
const cut = evaluateTermsGate({ unifiedEnabled: true, now: new Date(), current: cur21, acceptances: [on20[0], { ...on20[1], keepsCommercialAccess: false }] });
assert.equal(cut.businessAgreement, false);
// 1.2 author: commercial kept, no Business, invitation.
const g12 = evaluateTermsGate({ unifiedEnabled: true, now: new Date(), current: cur21, acceptances: [on20[0]] });
assert.deepEqual(g12, { accepted: true, acceptedCurrent: false, previousEditionActive: true, reacceptInvited: true, businessAgreement: false });
// After accepting 2.1: current, Business, no invitation.
const g21 = evaluateTermsGate({ unifiedEnabled: true, now: new Date(), current: cur21, acceptances: [...on20, { termsVersionId: "v21", coversBusiness: true, keepsCommercialAccess: false }] });
assert.deepEqual(g21, { accepted: true, acceptedCurrent: true, previousEditionActive: false, reacceptInvited: false, businessAgreement: true });
const banner = read("src/components/author-dashboard/AuthorAgreementReacceptBanner.tsx");
assert.match(banner, /status\.previousEditionActive && status\.businessAgreement/, "2.0 acceptor sees the 2.1 wording");
assert.match(banner, /продажи и «АудиоЛад Бизнес» сохраняются/);

// ---- Generic Business UI strings (no hardcoded edition) and en dash in touched files.
for (const rel of [
  "src/components/author-dashboard/business/AgreementRequiredNotice.tsx",
  "src/components/author-dashboard/business/BusinessAgreementStatusScreen.tsx",
  "src/components/author-dashboard/business/RightsholderVerificationForm.tsx",
  "src/lib/business-rightsholder/verification-errors.ts",
]) {
  assert.doesNotMatch(read(rel), /соглашение \(редакция 2\.0\)|соглашение 2\.0/, `${rel}: no hardcoded 2.0`);
}
for (const rel of [
  "src/lib/author-terms/approved-content-v21.ts",
  "src/components/author-dashboard/AuthorAgreementReacceptBanner.tsx",
  "docs/business/unified-agreement-8dcba9d1/sql/04-insert-edition-2.1.sql",
  "docs/business/unified-agreement-8dcba9d1/sql/05-switch-current-2.1.sql",
  "docs/business/unified-agreement-8dcba9d1/sql/06-rollback-switch-2.1.sql",
]) {
  assert.ok(!read(rel).includes("\u2014"), `${rel}: en dash only`);
}
console.log("author-terms-edition-21-unit: OK");
