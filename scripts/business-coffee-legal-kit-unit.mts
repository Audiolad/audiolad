/**
 * t1591u: ИНН Клиента, разбор реестра ФНС, сертификат точки (снимок, номер, поля), доступы.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { checkBusinessInn, isValidBusinessInn } from "../src/lib/business/legal/inn";
import { organizationLegalColumns, parseRegistryRows, russianQuotes, titleCaseRu } from "../src/lib/business/legal/egrul";
import {
  businessAccountCode,
  certificateCheckUrl,
  certificateDisplayNumber,
  certificateRows,
  certificateSnapshotIsCurrent,
  currentAccessStart,
  certificateStatusLabel,
  certificateSnapshotHash,
  certificateSnapshotJson,
  parseCertificateSnapshot,
  type CertificateSnapshot,
} from "../src/lib/business/legal/certificate";
import { BUSINESS_PUBLIC_PATH_REWRITES } from "../src/lib/business-app/host";
import { BUSINESS_ALLOWED_API_PATHS } from "../src/lib/business-app/proxy-policy";
import { coffeePublicPaths } from "../src/lib/business-app/seo";

// ИНН: контрольные цифры ФНС.
assert.equal(isValidBusinessInn("507305817690"), true, "ИП Петров – 12 цифр");
assert.equal(isValidBusinessInn("7707083893"), true, "ПАО Сбербанк – 10 цифр");
assert.equal(isValidBusinessInn("7707083894"), false);
assert.equal(isValidBusinessInn("507305817691"), false);
assert.equal(isValidBusinessInn("0000000000"), false);
assert.deepEqual(checkBusinessInn(" 7707 083-893 "), { ok: true, inn: "7707083893", kind: "ul" });
assert.deepEqual(checkBusinessInn(""), { ok: false, error: "inn_empty" });
assert.deepEqual(checkBusinessInn("12345"), { ok: false, error: "inn_format" });
assert.deepEqual(checkBusinessInn("77070838a3"), { ok: false, error: "inn_format" });
assert.deepEqual(checkBusinessInn(7707083893), { ok: false, error: "inn_empty" });

// Реестр: действующая запись, ИП и организация, прекращённая деятельность, чужой ИНН.
assert.equal(titleCaseRu("ПЕТРОВ СЕРГЕЙ СЕРГЕЕВИЧ"), "Петров Сергей Сергеевич");
assert.equal(titleCaseRu("РИМСКИЙ-КОРСАКОВ НИКОЛАЙ"), "Римский-Корсаков Николай");
assert.equal(russianQuotes('ООО "РОМАШКА"'), "ООО «РОМАШКА»");
const ip = parseRegistryRows("507305817690", {
  rows: [
    { i: "507305817690", k: "fl", n: "ПЕТРОВ СЕРГЕЙ СЕРГЕЕВИЧ", o: "316505300063237", r: "25.11.2016" },
    { i: "507305817690", k: "fl", n: "ПЕТРОВ СЕРГЕЙ СЕРГЕЕВИЧ", o: "305503407000112", r: "11.03.2005", e: "07.03.2007" },
  ],
});
assert.deepEqual(ip, {
  ok: true,
  identity: {
    inn: "507305817690",
    kind: "ip",
    fullName: "Петров Сергей Сергеевич",
    displayName: "ИП Петров Сергей Сергеевич",
    ogrn: "316505300063237",
    registeredOn: "25.11.2016",
  },
});
const ul = parseRegistryRows("7707083893", {
  rows: [{ c: "ПАО СБЕРБАНК", i: "7707083893", k: "ul", n: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"', o: "1027700132195", r: "16.08.2002" }],
});
assert.equal(ul.ok && ul.identity.displayName, "ПАО СБЕРБАНК");
assert.equal(ul.ok && ul.identity.fullName, "ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО «СБЕРБАНК РОССИИ»");
assert.deepEqual(parseRegistryRows("7707083893", { rows: [] }), { ok: false, error: "inn_not_found" });
assert.deepEqual(parseRegistryRows("7707083893", { rows: [{ i: "7736207543", k: "ul", n: "X", o: "1027700000000" }] }), { ok: false, error: "inn_not_found" });
assert.deepEqual(parseRegistryRows("7707083893", { rows: [{ i: "7707083893", k: "ul", n: "X", o: "1027700132195", e: "01.01.2020" }] }), { ok: false, error: "inn_inactive" });
assert.deepEqual(parseRegistryRows("7707083893", { rows: [{ i: "7707083893", k: "ul", n: "X", o: "12" }] }), { ok: false, error: "registry_unavailable" });
assert.deepEqual(parseRegistryRows("7707083893", null), { ok: false, error: "inn_not_found" });

// Колонки организации по ответу реестра: дата ГГГГ-ММ-ДД, отметка о прекращении снимается.
assert.deepEqual(organizationLegalColumns(ip.ok ? ip.identity : (null as never), new Date("2026-11-19T09:00:00Z")), {
  legal_inn: "507305817690",
  legal_kind: "ip",
  legal_name: "ИП Петров Сергей Сергеевич",
  legal_full_name: "Петров Сергей Сергеевич",
  legal_ogrn: "316505300063237",
  legal_registered_on: "2016-11-25",
  legal_checked_at: "2026-11-19T09:00:00.000Z",
  legal_inactive_at: null,
});

// Сертификат: снимок, хеш, поля приложения 2.
const snap: CertificateSnapshot = {
  v: 1,
  venueName: "Кофейня «Пример»",
  venueAddress: "г. Город, ул. Примерная, д. 1",
  licensee: { kind: "ul", name: "ООО «КОФЕЙНЯ ПРИМЕР»", fullName: "ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «КОФЕЙНЯ ПРИМЕР»", inn: "7707083893", ogrn: "1027700132195" },
  accountCode: businessAccountCode("7f3a21c9-0000-4000-8000-000000000000"),
  period: { kind: "gift", start: "2026-11-19T09:00:00.000Z", end: "2026-11-26T09:00:00.000Z" },
  offer: { version: "offer-v3-2026-11-18", label: "Редакция 3 от 18.11.2026", acceptedAt: "2026-11-19T09:05:00.000Z" },
};
assert.equal(snap.accountCode, "7F3A-21C9");
assert.equal(certificateSnapshotHash(snap), certificateSnapshotHash(JSON.parse(certificateSnapshotJson(snap))), "стабильный хеш");
assert.notEqual(certificateSnapshotHash(snap), certificateSnapshotHash({ ...snap, venueAddress: snap.venueAddress + "А" }), "смена адреса = новый сертификат");
assert.notEqual(certificateSnapshotHash(snap), certificateSnapshotHash({ ...snap, period: { ...snap.period, end: "2026-12-26T09:00:00.000Z" } }), "новый период = новый сертификат");
assert.match(certificateSnapshotHash(snap), /^[0-9a-f]{64}$/);
assert.equal(parseCertificateSnapshot(JSON.parse(certificateSnapshotJson(snap)))?.licensee.inn, "7707083893");
assert.equal(parseCertificateSnapshot({ v: 2 }), null);
assert.equal(certificateDisplayNumber("ALK-2026-000002"), "АЛК-2026-000002");
assert.equal(certificateCheckUrl("ALK-2026-000002"), "https://audiolad.ru/b/coffee/legal/sertifikat/ALK-2026-000002");
const rows = Object.fromEntries(certificateRows({ number: "ALK-2026-000002", issuedAt: "2026-11-19T09:06:00.000Z", snapshot: snap }));
assert.equal(rows["Номер"], "АЛК-2026-000002");
assert.equal(rows["Выдан"], "19.11.2026");
assert.equal(rows["Действует по"], "26.11.2026");
assert.equal(rows["Лицензиат"], "ООО «КОФЕЙНЯ ПРИМЕР»");
assert.equal(rows["ИНН / ОГРН"], "7707083893 / 1027700132195");
assert.equal(rows["Срок доступа"], "с 19.11.2026 по 26.11.2026, подарочный период");
assert.equal(rows["Каталог"], "каталог «АудиоЛад Кофейня»");
assert.equal(rows["Создание музыки"], "MusicGPT и другие сервисы генерации музыки");
assert.match(rows["Лицензиар"], /ИП Петров Сергей Сергеевич, ИНН 507305817690, ОГРНИП 316505300063237/);
assert.equal(rows["Основание"], "Договор-оферта «АудиоЛад Кофейня», редакция 3 от 18.11.2026, принята 19.11.2026");
assert.equal(rows["Учётная запись"], "№ 7F3A-21C9");
assert.ok(!("Юридический адрес" in rows), "юр. адреса в реестре нет – в сертификате тоже");
for (const v of Object.values(rows)) assert.doesNotMatch(v, /—|@|\+7/, "без длинного тире и личных контактов");

// Действующий сертификат перестаёт действовать, если точка или лицензиат изменились.
const facts = { venueName: snap.venueName, venueAddress: snap.venueAddress, licensee: { inn: snap.licensee.inn, ogrn: snap.licensee.ogrn, name: snap.licensee.name }, licenseeInactive: false };
assert.equal(certificateSnapshotIsCurrent(snap, facts), true);
assert.equal(certificateSnapshotIsCurrent(snap, { ...facts, venueAddress: "г. Город, ул. Другая, д. 2" }), false, "новый адрес");
assert.equal(certificateSnapshotIsCurrent(snap, { ...facts, venueAddress: null }), false, "адрес стёрт");
assert.equal(certificateSnapshotIsCurrent(snap, { ...facts, venueName: "Другая" }), false, "новое название точки");
assert.equal(certificateSnapshotIsCurrent(snap, { ...facts, licensee: { ...facts.licensee, inn: "507305817690" } }), false, "другой ИНН");
assert.equal(certificateSnapshotIsCurrent(snap, { ...facts, licensee: { ...facts.licensee, name: "ООО «НОВОЕ»" } }), false, "переименование по ФНС");
assert.equal(certificateSnapshotIsCurrent(snap, { ...facts, licensee: null }), false, "ИНН удалён");
assert.equal(certificateSnapshotIsCurrent(snap, { ...facts, licenseeInactive: true }), false, "прекратил деятельность");
assert.equal(certificateStatusLabel("outdated"), "Не действует: данные точки или лицензиата изменились");
assert.equal(certificateStatusLabel("valid"), "Действует");

// Начало срока: самое позднее начало среди окон, которые идут сейчас.
const nowAt = new Date("2026-11-19T12:00:00Z");
const gift = { start: "2026-11-19T09:00:00.000Z", end: "2026-11-26T09:00:00.000Z" };
// Оплата во время подарочной недели: оплаченный период начнётся позже, сейчас идёт неделя.
assert.equal(currentAccessStart([{ start: "2026-11-26T09:00:00.000Z", end: "2026-12-26T09:00:00.000Z" }, gift], nowAt), gift.start);
// Досрочное продление: идёт период 08.11–08.12, следующий начнётся 08.12.
assert.equal(
  currentAccessStart(
    [
      { start: "2026-12-08T09:00:00.000Z", end: "2027-01-07T09:00:00.000Z" },
      { start: "2026-11-08T09:00:00.000Z", end: "2026-12-08T09:00:00.000Z" },
    ],
    nowAt,
  ),
  "2026-11-08T09:00:00.000Z",
);
// Два окна сразу (оплата другой точки): берём позднее начало, срок не завышается.
assert.equal(
  currentAccessStart(
    [
      { start: "2026-10-20T09:00:00.000Z", end: "2026-11-20T09:00:00.000Z" },
      { start: "2026-11-10T09:00:00.000Z", end: "2026-12-10T09:00:00.000Z" },
    ],
    nowAt,
  ),
  "2026-11-10T09:00:00.000Z",
);
assert.equal(currentAccessStart([{ start: "2026-11-26T09:00:00.000Z", end: "2026-12-26T09:00:00.000Z" }], nowAt), null, "доступа сейчас нет");

// Сервер: пробная неделя – действующий доступ; выдача только для своей точки; проверка – только чтение.
const server = readFileSync("src/lib/business/legal/certificate.server.ts", "utf8");
assert.match(server, /resolved\.mode === "trial" \|\| resolved\.mode === "paid"/);
assert.match(server, /rpc\("issue_business_venue_certificate"/);
assert.match(server, /REGISTRY_FRESH_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(server, /status = "outdated"/, "проверка сверяет снимок с текущими данными");
assert.match(server, /validUntil = access\.end;/, "срок на странице проверки – ровно текущий доступ");
assert.match(server, /start: currentAccessStart\(\[\.\.\.paid/);
assert.match(server, /\.lte\("period_start", at\)\s*\.gt\("period_end", at\)/, "только идущие сейчас периоды, без лимита истории");
assert.match(server, /refreshOrganizationLegalIdentity\(db, row\.organization_id, stored, now, !unchanged\)/, "новый сертификат – только по свежим сведениям ФНС");
assert.match(server, /certificate_revoked/);
const lookupSrc = readFileSync("src/lib/business/legal/egrul.server.ts", "utf8");
assert.match(lookupSrc, /return \{ ok: true, json: await res\.json\(\)/, "тело ответа читается под тем же таймером");
assert.match(lookupSrc, /TOTAL_TIMEOUT_MS = 20000/);
const ctx = readFileSync("src/lib/business/legal/certificate-context.server.ts", "utf8");
assert.match(ctx, /ensureVenueCertificate\(domain\.location\.id\)/, "точка владельца из сессии");
assert.match(ctx, /ensureVenueCertificate\(venue\.locationId\)/, "точка устройства зала из cookie");
assert.doesNotMatch(ctx, /searchParams|params/, "номер точки не берётся из адреса страницы");
const route = readFileSync("src/app/api/business/legal-identity/route.ts", "utf8");
assert.match(route, /membership\.role !== "owner"/, "ИНН – только владелец");
assert.match(route, /businessHallDeviceLocked/, "не устройство зала");
assert.match(route, /lookupBusinessRegistry/, "название и ОГРН – только из реестра");

// Миграция: только добавляет, RLS без политик, функция выдачи только для service_role.
const sql = readFileSync("supabase/migrations/20270317120000_business_coffee_legal_kit.sql", "utf8");
const body = sql.replace(/^--.*$/gm, "");
assert.doesNotMatch(body, /^\s*(DROP|DELETE|TRUNCATE)\b/im);
assert.match(body, /ENABLE ROW LEVEL SECURITY/);
assert.doesNotMatch(body, /CREATE POLICY/);
assert.match(body, /REVOKE ALL ON FUNCTION public\.issue_business_venue_certificate\([^)]*\) FROM PUBLIC, anon, authenticated/);
assert.match(body, /START WITH 2/, "000001 – образец");
assert.match(body, /ADD COLUMN IF NOT EXISTS legal_inactive_at timestamptz/);
assert.match(body, /RAISE EXCEPTION 'certificate_revoked'/, "отозванный не заменяется молча");
assert.match(body, /WHERE superseded_at IS NULL AND revoked_at IS NULL/, "один действующий сертификат на точку");

// Маршруты кабинета.
assert.equal(BUSINESS_PUBLIC_PATH_REWRITES["/documents/sertifikat"], "/business-app/documents/sertifikat");
assert.ok((BUSINESS_ALLOWED_API_PATHS as readonly string[]).includes("/api/business/legal-identity"));
assert.ok(!coffeePublicPaths().includes("/documents/sertifikat"), "сертификат не в sitemap");

console.log("business-coffee-legal-kit-unit: PASS");
