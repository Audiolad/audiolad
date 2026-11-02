/**
 * Gift-week attribution (task 253821e0, PR 3): channel/utm/referrer sanitizing, link carry,
 * device family, DB-IP record mapping, MAX Поток response parsing, funnel, admin render,
 * migration and rollback shape, and «no IP / user agent / URL is ever stored».
 * Optional: BUSINESS_GEOIP_TEST_DB=/path/dbip-city-lite.mmdb runs a real lookup.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminBusinessTrials, {
  businessTrialDeviceLabel,
  businessTrialPlaceLabel,
  businessTrialSourceLabel,
} from "../src/components/admin/AdminBusinessTrials";
import {
  BUSINESS_TRIAL_NO_DATA,
  buildBusinessTrialFunnel,
  buildBusinessTrialStats,
  businessTrialConversion,
  type BusinessTrialFacts,
  type BusinessTrialOrigin,
} from "../src/lib/admin/business-trials";
import { businessTrialOriginFromRow } from "../src/lib/admin/business-trials-queries";
import { parseMaxPotokFunnel } from "../src/lib/admin/max-potok-funnel.server";
import {
  businessAttributionFromLanding,
  businessEntryChannel,
  businessReferrerDomain,
  businessUtmValue,
  carryBusinessAttribution,
  parseStoredBusinessAttribution,
  sanitizeBusinessTrialAttribution,
} from "../src/lib/business-trial-attribution/attribution";
import { businessTrialAttributionConfig } from "../src/lib/business-trial-attribution/config";
import { businessDeviceFamily } from "../src/lib/business-trial-attribution/device";
import { businessGeoFromRecord } from "../src/lib/business-trial-attribution/geo";
import { lookupBusinessGeo } from "../src/lib/business-trial-attribution/geo.server";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const count = (text: string, needle: string) => text.split(needle).length - 1;

async function main() {
  // Config: OFF by default; only absolute DB path, https funnel URL, 32+ char token.
  const off = businessTrialAttributionConfig({});
  assert.deepEqual(off, { enabled: false, geoDbPath: null, maxPotokFunnelUrl: null, maxPotokFunnelToken: null });
  assert.equal(businessTrialAttributionConfig({ AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED: "true" }).enabled, false);
  const on = businessTrialAttributionConfig({
    AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED: "1",
    AUDIOLAD_GEOIP_CITY_DB: "/srv/geo/city.mmdb",
    AUDIOLAD_MAX_POTOK_FUNNEL_URL: "https://potok.example/api/v1/audiolad/channel-funnel",
    AUDIOLAD_MAX_POTOK_FUNNEL_TOKEN: "x".repeat(40),
  });
  assert.equal(on.enabled, true);
  assert.equal(on.geoDbPath, "/srv/geo/city.mmdb");
  assert.equal(on.maxPotokFunnelUrl, "https://potok.example/api/v1/audiolad/channel-funnel");
  assert.equal(on.maxPotokFunnelToken?.length, 40);
  const bad = businessTrialAttributionConfig({
    AUDIOLAD_GEOIP_CITY_DB: "geo/city.mmdb",
    AUDIOLAD_MAX_POTOK_FUNNEL_URL: "http://potok.example/x",
    AUDIOLAD_MAX_POTOK_FUNNEL_TOKEN: "short",
  });
  assert.deepEqual([bad.geoDbPath, bad.maxPotokFunnelUrl, bad.maxPotokFunnelToken], [null, null, null]);

  // Channel, utm, referrer domain.
  assert.equal(businessEntryChannel("MAX"), "max");
  assert.equal(businessEntryChannel(" tg "), "tg");
  assert.equal(businessEntryChannel("telegram"), "tg");
  assert.equal(businessEntryChannel("vk"), null);
  assert.equal(businessEntryChannel(1), null);
  assert.equal(businessUtmValue(" bot "), "bot");
  assert.equal(businessUtmValue("x".repeat(101)), null);
  assert.equal(businessUtmValue("a\nb"), null);
  assert.equal(businessReferrerDomain("https://www.Yandex.ru/search/?text=кофе&lr=213"), "yandex.ru");
  assert.equal(businessReferrerDomain("https://audiolad.ru/b/atlas-kofeen?ch=max"), "audiolad.ru");
  assert.equal(businessReferrerDomain("https://coffee.audiolad.ru/start"), null, "own host is not a source");
  assert.equal(businessReferrerDomain("http://192.168.0.1:8080/"), "192.168.0.1");
  assert.equal(businessReferrerDomain("localhost"), null);
  assert.equal(businessReferrerDomain("javascript:alert(1)"), null);
  assert.equal(businessReferrerDomain(""), null);

  // Browser payload → strict server copy; junk never fails the start.
  assert.equal(sanitizeBusinessTrialAttribution(null), null);
  assert.equal(sanitizeBusinessTrialAttribution([]), null);
  assert.equal(sanitizeBusinessTrialAttribution({ ch: "vk", ref: "<script>" }), null);
  assert.deepEqual(
    sanitizeBusinessTrialAttribution({ ch: "max", ref: "https://m.vk.com/away?x=1", utm_source: "bot", utm_medium: "button", utm_campaign: "gift", ip: "1.2.3.4" }),
    { channel: "max", referrerDomain: "m.vk.com", utmSource: "bot", utmMedium: "button", utmCampaign: "gift" },
  );
  const landing = businessAttributionFromLanding("?ch=tg&utm_source=tgbot&utm_campaign=atlas&email=a%40b.ru", "https://web.telegram.org/k/");
  assert.deepEqual(landing, { ch: "tg", utm_source: "tgbot", utm_campaign: "atlas", ref: "web.telegram.org" });
  assert.deepEqual(parseStoredBusinessAttribution(JSON.stringify(landing)), landing);
  assert.equal(parseStoredBusinessAttribution("{broken"), null);
  assert.equal(parseStoredBusinessAttribution("[1]"), null);
  assert.deepEqual(parseStoredBusinessAttribution(JSON.stringify({ ch: "x", token: "secret" })), {});

  // Link carry: only https coffee/business links, existing params win.
  const carried = { ch: "max", utm_source: "bot" } as const;
  assert.equal(
    carryBusinessAttribution("https://coffee.audiolad.ru/?from=atlas", carried),
    "https://coffee.audiolad.ru/?from=atlas&ch=max&utm_source=bot",
  );
  assert.equal(carryBusinessAttribution("https://business.audiolad.ru/?ch=tg", { ch: "max" }), null, "existing ch wins");
  assert.equal(carryBusinessAttribution("/b/coffee", carried, "https://audiolad.ru/b/atlas-kofeen"), null, "same site untouched");
  assert.equal(carryBusinessAttribution("http://coffee.audiolad.ru/", carried), null);
  assert.equal(carryBusinessAttribution("https://evil.example/", carried), null);
  assert.equal(carryBusinessAttribution("https://coffee.audiolad.ru/", {}), null);
  assert.equal(carryBusinessAttribution("::::", carried), null);

  // Device family: three coarse labels only.
  const UA = {
    iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    androidYandex: "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.1.123.00 SA/3 Mobile Safari/537.36",
    androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    androidTelegram: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Telegram-Android/11.2.0",
    windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    linuxFirefox: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    ipad: "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  };
  assert.deepEqual(businessDeviceFamily(UA.iphoneSafari), { deviceClass: "phone", osFamily: "ios", browserFamily: "safari" });
  assert.deepEqual(businessDeviceFamily(UA.androidYandex), { deviceClass: "phone", osFamily: "android", browserFamily: "yandex" });
  assert.deepEqual(businessDeviceFamily(UA.androidTablet), { deviceClass: "tablet", osFamily: "android", browserFamily: "chrome" });
  assert.deepEqual(businessDeviceFamily(UA.androidTelegram), { deviceClass: "phone", osFamily: "android", browserFamily: "telegram" });
  assert.deepEqual(businessDeviceFamily(UA.windowsEdge), { deviceClass: "computer", osFamily: "windows", browserFamily: "edge" });
  assert.deepEqual(businessDeviceFamily(UA.macChrome), { deviceClass: "computer", osFamily: "macos", browserFamily: "chrome" });
  assert.deepEqual(businessDeviceFamily(UA.linuxFirefox), { deviceClass: "computer", osFamily: "linux", browserFamily: "firefox" });
  assert.deepEqual(businessDeviceFamily(UA.ipad), { deviceClass: "tablet", osFamily: "ios", browserFamily: "safari" });
  assert.deepEqual(businessDeviceFamily(null), { deviceClass: null, osFamily: null, browserFamily: null });
  assert.deepEqual(businessDeviceFamily("   "), { deviceClass: null, osFamily: null, browserFamily: null });
  assert.equal(businessDeviceFamily("x".repeat(100_000)).osFamily, "other");

  // DB-IP record → country code, region, city; coordinates and everything else dropped.
  const geo = businessGeoFromRecord({
    city: { names: { en: "Kazan" } },
    continent: { code: "EU" },
    country: { iso_code: "RU", names: { en: "Russia", ru: "Россия" } },
    location: { latitude: 55.79, longitude: 49.12 },
    subdivisions: [{ names: { en: "Tatarstan Republic" } }],
  });
  assert.deepEqual(geo, { country: "RU", region: "Tatarstan Republic", city: "Kazan" });
  assert.deepEqual(businessGeoFromRecord({ country: { iso_code: "ru" }, city: { names: { ru: "Тверь\u0007", en: "Tver" } } }), { country: null, region: null, city: "Тверь" });
  assert.equal(businessGeoFromRecord({ city: { names: { en: "x".repeat(200) } } })?.city?.length, 80);
  assert.equal(businessGeoFromRecord(null), null);
  assert.equal(businessGeoFromRecord({ location: { latitude: 1 } }), null);

  // Lookup never throws: no path, bad IP, missing file.
  assert.equal(await lookupBusinessGeo("8.8.8.8", null), null);
  assert.equal(await lookupBusinessGeo("not-an-ip", "/nonexistent.mmdb"), null);
  assert.equal(await lookupBusinessGeo("8.8.8.8", "/nonexistent/dbip.mmdb"), null);
  const realDb = process.env.BUSINESS_GEOIP_TEST_DB;
  if (realDb && existsSync(realDb)) {
    const google = await lookupBusinessGeo("::ffff:8.8.8.8", realDb);
    assert.equal(google?.country, "US");
    assert.equal(await lookupBusinessGeo("192.168.1.10", realDb), null, "private IP has no city");
    const yandex = await lookupBusinessGeo("77.88.55.88", realDb);
    assert.equal(yandex?.country, "RU");
    console.log("business-trial-attribution-unit: real DB-IP lookup ok");
  }

  // MAX Поток response: strict shape, non-negative integers only.
  assert.deepEqual(
    parseMaxPotokFunnel({ ok: true, channels: { max: { botStarts: 12, giftClicks: 5 }, tg: { botStarts: 3, giftClicks: 1 } } }),
    { max: { botStarts: 12, giftClicks: 5 }, tg: { botStarts: 3, giftClicks: 1 } },
  );
  assert.deepEqual(parseMaxPotokFunnel({ ok: true, channels: { max: { botStarts: 1, giftClicks: 1 }, tg: { botStarts: -1, giftClicks: 0 } } }), { max: { botStarts: 1, giftClicks: 1 } });
  assert.equal(parseMaxPotokFunnel({ ok: false, channels: {} }), null);
  assert.equal(parseMaxPotokFunnel({ ok: true, channels: { max: { botStarts: 1.5, giftClicks: 1 } } }), null);
  assert.equal(parseMaxPotokFunnel("nope"), null);

  // Row → origin: unknown enum values dropped (the loader maps attributed rows only).
  assert.deepEqual(
    businessTrialOriginFromRow({
      attributed_at: "2026-11-03T09:00:00.000Z", entry_channel: "tg", referrer_domain: "web.telegram.org",
      utm_source: "tgbot", utm_medium: null, utm_campaign: "atlas", geo_country: "RU", geo_region: "Moscow", geo_city: "Moscow",
      device_class: "phone", os_family: "android", browser_family: "telegram",
    }),
    {
      channel: "tg", referrerDomain: "web.telegram.org", utmSource: "tgbot", utmMedium: null, utmCampaign: "atlas",
      country: "RU", region: "Moscow", city: "Moscow", deviceClass: "phone", osFamily: "android", browserFamily: "telegram",
    },
  );
  const weird = businessTrialOriginFromRow({ attributed_at: "2026-11-03T09:00:00.000Z", entry_channel: "vk", device_class: "tv" });
  assert.equal(weird?.channel, null);
  assert.equal(weird?.deviceClass, null);

  // Funnel: bot steps from MAX Поток, start/paid from our attributed starts.
  const origin = (channel: "max" | "tg" | null): BusinessTrialOrigin => ({
    channel, referrerDomain: null, utmSource: null, utmMedium: null, utmCampaign: null,
    country: "RU", region: null, city: "Kazan", deviceClass: "phone", osFamily: "ios", browserFamily: "safari",
  });
  const funnelRows = [
    { origin: origin("max"), everPaid: true },
    { origin: origin("max"), everPaid: false },
    { origin: origin("tg"), everPaid: false },
    { origin: origin(null), everPaid: true },
    { origin: null, everPaid: true },
  ];
  const funnel = buildBusinessTrialFunnel(funnelRows, true, { max: { botStarts: 20, giftClicks: 8 } });
  assert.equal(funnel.maxPotok, true);
  assert.deepEqual(funnel.columns, [
    { channel: "max", botStarts: 20, giftClicks: 8, started: 2, paid: 1 },
    { channel: "tg", botStarts: null, giftClicks: null, started: 1, paid: 0 },
    { channel: "none", botStarts: null, giftClicks: null, started: 1, paid: 1 },
  ]);
  const funnelOff = buildBusinessTrialFunnel(funnelRows, false, null);
  assert.equal(funnelOff.maxPotok, false);
  assert.ok(funnelOff.columns.every((c) => c.started === 0 && c.paid === 0 && c.botStarts === null));
  assert.equal(businessTrialConversion(8, 2), 25);
  assert.equal(businessTrialConversion(0, 2), null);
  assert.equal(businessTrialConversion(null, 2), null);

  // Labels.
  assert.equal(businessTrialSourceLabel(origin("max")), "бот МАКС");
  assert.equal(businessTrialSourceLabel({ ...origin(null), utmSource: "vk", utmCampaign: "autumn", referrerDomain: "vk.com" }), "utm: vk / autumn; переход с vk.com");
  assert.equal(businessTrialSourceLabel(origin(null)), "без метки");
  assert.ok((businessTrialPlaceLabel(origin("max")) ?? "").includes("Kazan"));
  assert.ok((businessTrialDeviceLabel(origin("max")) ?? "").startsWith("телефон"));

  // Stats + render: off → columns «нет данных», no DB-IP city; on → labels, funnel, attribution link.
  const now = new Date("2026-11-06T12:00:00.000Z");
  const KIND = "business_new_client";
  const grants = [
    { userId: "11111111-aaaa-4bbb-8ccc-dddddddddddd", hasEmail: false, kind: KIND, startsAt: "2026-11-03T09:00:00.000Z", endsAt: "2026-11-10T09:00:00.000Z" },
    { userId: "22222222-aaaa-4bbb-8ccc-dddddddddddd", hasEmail: false, kind: KIND, startsAt: "2026-11-04T09:00:00.000Z", endsAt: "2026-11-11T09:00:00.000Z" },
    { userId: "33333333-aaaa-4bbb-8ccc-dddddddddddd", hasEmail: true, kind: KIND, startsAt: "2026-11-04T10:00:00.000Z", endsAt: "2026-11-11T10:00:00.000Z" },
  ];
  const facts = new Map<string, BusinessTrialFacts>([
    [grants[0].userId, { organizationName: "Кофейня", guestStart: true, origin: origin("max"), paidUntil: "2026-12-06T09:00:00.000Z" }],
    [grants[1].userId, { organizationName: "Бар", guestStart: true, origin: { ...origin("tg"), city: null, region: null, country: null } }],
    [grants[2].userId, { organizationName: "Пекарня" }],
  ]);
  const statsOff = buildBusinessTrialStats({ now, grants, facts });
  assert.equal(statsOff.attributionEnabled, false);
  assert.ok(statsOff.rows.every((row) => row.origin === null));
  const htmlOff = renderToStaticMarkup(createElement(AdminBusinessTrials, { data: statsOff }));
  assert.ok(htmlOff.includes("data-trial-attribution-off"));
  assert.ok(htmlOff.includes("Воронка по каналам"));
  assert.ok(!htmlOff.includes("Kazan"));
  for (const header of ["Откуда", "Город и устройство"]) assert.ok(htmlOff.includes(header), header);

  const statsOn = buildBusinessTrialStats({
    now, grants, facts, attributionEnabled: true,
    maxPotok: { max: { botStarts: 10, giftClicks: 4 }, tg: { botStarts: 5, giftClicks: 2 } },
  });
  assert.deepEqual(statsOn.funnel.columns.map((c) => [c.channel, c.botStarts, c.giftClicks, c.started, c.paid]), [
    ["max", 10, 4, 1, 1],
    ["tg", 5, 2, 1, 0],
    ["none", null, null, 0, 0],
  ]);
  const htmlOn = renderToStaticMarkup(createElement(AdminBusinessTrials, { data: statsOn }));
  assert.ok(!htmlOn.includes("data-trial-attribution-off"));
  for (const text of ["бот МАКС", "бот Телеграм", "Kazan", "телефон", "Подписались на бота", "Нажали ссылку на подарок", "Начали 7 дней в подарок", "Оплатили", "(40%)", "(25%)", "(100%)"]) {
    assert.ok(htmlOn.includes(text), text);
  }
  assert.ok(htmlOn.includes('data-trial-funnel-cell="bot-max"'));
  // The only external link: DB-IP attribution, nofollow, admin page only.
  assert.equal(count(htmlOn, 'href="https://db-ip.com"'), 1);
  assert.ok(/<a href="https:\/\/db-ip\.com" rel="nofollow[^"]*"[^>]*>IP Geolocation by DB-IP<\/a>/.test(htmlOn));
  assert.equal(count(htmlOn, 'href="http'), 1, "no other external links");
  assert.ok(htmlOn.includes("IP-адрес не сохраняется"));
  for (const html of [htmlOff, htmlOn]) {
    assert.ok(!html.includes("\u2014"), "en dash only");
    assert.ok(!/3\s*дн/.test(html), "no 3-day wording");
  }
  assert.ok(htmlOn.includes(`>${BUSINESS_TRIAL_NO_DATA}<`), "registered start without origin shows «нет данных»");

  // DB-IP link only on the admin page; no visible-site component mentions db-ip.
  for (const rel of [
    "src/components/business-app/BusinessAttributionCapture.tsx",
    "src/components/business/attribution/AttributionLinkCarrier.tsx",
    "src/components/business-app/BusinessGuestStartCta.tsx",
  ]) assert.ok(!read(rel).includes("db-ip.com"), rel);

  // Server writers: flag gate, write-once, no IP/UA/referrer in logs or columns.
  const record = read("src/lib/business-trial-attribution/record.server.ts");
  assert.ok(record.startsWith('import "server-only";'));
  assert.ok(record.includes("if (!config.enabled) return;"));
  assert.ok(record.includes('.is("attributed_at", null)'), "write-once");
  assert.equal(count(record, 'console.warn("business_trial_attribution_failed")'), 2);
  assert.equal(count(record, "console."), 2, "only the fixed warning is logged");
  assert.ok(!/\b(ip|user_agent|ua|referrer_url|url)\s*:/.test(record.split(".update(")[1] ?? ""), "no raw columns written");
  const geoServer = read("src/lib/business-trial-attribution/geo.server.ts");
  assert.ok(geoServer.startsWith('import "server-only";'));
  assert.ok(!geoServer.includes("console."));
  const route = read("src/app/api/business/guest-start/route.ts");
  assert.ok(route.includes("recordBusinessGuestStartAttribution("));
  const start = read("src/lib/business-guest/start.ts");
  assert.ok(start.includes("sanitizeBusinessTrialAttribution(body.attribution)"));
  const funnelServer = read("src/lib/admin/max-potok-funnel.server.ts");
  assert.ok(funnelServer.includes('redirect: "error"') && funnelServer.includes("AbortSignal.timeout("));
  assert.ok(funnelServer.includes("if (!config.enabled || !config.maxPotokFunnelUrl || !config.maxPotokFunnelToken) return null;"));
  const queries = read("src/lib/admin/business-trials-queries.ts");
  assert.ok(/attributionEnabled \? loadMaxPotokFunnel\(/.test(queries), "MAX Поток only with the flag");
  assert.ok(queries.includes("attributionEnabled ? `, ${ATTRIBUTION_COLUMNS}` : \"\""), "new columns only with the flag");
  assert.ok(queries.includes("if (attributionEnabled && str(row.attributed_at))"), "origin only for attributed rows");

  // Client side: sessionStorage only, no cookies, carrier only on atlas.
  for (const rel of ["src/components/business-app/BusinessAttributionCapture.tsx", "src/components/business/attribution/AttributionLinkCarrier.tsx"]) {
    const text = read(rel);
    assert.ok(text.startsWith('"use client";'));
    assert.ok(text.includes("sessionStorage"));
    assert.ok(!/document\.cookie|localStorage|fetch\(|navigator\.(userAgent|platform)/.test(text), rel);
  }
  assert.ok(read("src/app/business-app/layout.tsx").includes("<BusinessAttributionCapture />"));
  assert.ok(read("src/app/(platform)/b/atlas-kofeen/layout.tsx").includes("<AttributionLinkCarrier />"));

  // Migration and rollback shape.
  const migration = read("supabase/migrations/20270214120000_business_trial_attribution.sql");
  for (const column of ["attributed_at timestamptz", "entry_channel text", "referrer_domain text", "utm_source text", "utm_medium text", "utm_campaign text", "geo_country text", "geo_region text", "geo_city text", "device_class text", "os_family text", "browser_family text"]) {
    assert.ok(migration.includes(`ADD COLUMN IF NOT EXISTS ${column}`), column);
  }
  assert.ok(migration.includes("NOT VALID"));
  assert.ok(migration.includes("SET LOCAL lock_timeout"));
  assert.ok(!/ADD COLUMN IF NOT EXISTS\s+(ip|client_ip|user_agent|ua|referrer_url|landing_url|latitude|longitude|fingerprint)\b/i.test(migration), "no personal columns");
  assert.ok(!/\b(inet|CREATE TABLE)\b/i.test(migration.replace(/^--.*$/gm, "")));
  const rollback = read("supabase/rollbacks/20270214120000_business_trial_attribution.rollback.sql");
  assert.ok(rollback.includes("DROP CONSTRAINT IF EXISTS business_guest_starts_attribution_check"));
  assert.equal(count(rollback, "DROP COLUMN IF EXISTS"), 12);
  assert.ok(rollback.includes("20270214120000"));
  assert.ok(!/DROP TABLE/i.test(rollback));

  // GeoIP database is downloaded on the server, never committed.
  assert.ok(/^\*\.mmdb$/m.test(read(".gitignore")));
  const refresh = read("scripts/business-geoip-refresh.sh");
  assert.ok(refresh.includes("https://download.db-ip.com/free/dbip-city-lite-"));
  assert.ok(refresh.includes("mv -f"));
  assert.ok(refresh.includes("DBIP-City-Lite"));
  assert.ok(read("package.json").includes('"mmdb-lib": "3.0.4"'));

  for (const text of [migration, rollback, record, refresh, read("docs/business/TRIAL_ATTRIBUTION_GEO_DEVICE_RU.md")]) assert.ok(!text.includes("\u2014"));
  console.log("business-trial-attribution-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
