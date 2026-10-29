import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { pointClientIpCollapsed, pointJoinResult, POINT_JOIN_WRONG } from "../src/lib/business-app/point-join";
import {
  BUSINESS_POINT_COOKIE,
  formatPointCode,
  isPointToken,
  normalizePointCode,
  pointCodeInput,
  pointCookieOptions,
} from "../src/lib/business-app/point-session";
import {
  pointCodeDeadline,
  pointCodeSecondsLeft,
  pointDeviceLink,
  pointMailtoUrl,
  pointShareText,
  pointTelegramShareUrl,
  pointWaitMinutes,
} from "../src/lib/business-app/point-share";

assert.equal(BUSINESS_POINT_COOKIE, "al-point");

// 4-digit format.
assert.equal(normalizePointCode("4719"), "4719");
assert.equal(normalizePointCode(" 4 7 1 9 "), "4719");
assert.equal(normalizePointCode("47-19"), "4719");
assert.equal(normalizePointCode("0007"), "0007");
assert.equal(normalizePointCode("471"), null);
assert.equal(normalizePointCode("47190"), null);
assert.equal(normalizePointCode("1d94cacba7"), null, "old 10-character codes are not accepted");
assert.equal(normalizePointCode("abcd"), null);
assert.equal(normalizePointCode("код"), null);
assert.equal(pointCodeInput("4a7 1-9 5"), "4719");
assert.equal(formatPointCode("4719"), "4 7 1 9");

assert.equal(isPointToken("a".repeat(64)), true);
assert.equal(isPointToken("g".repeat(64)), false);

const options = pointCookieOptions(true);
assert.equal(options.httpOnly, true);
assert.equal(options.secure, true);
assert.equal(options.path, "/");
assert.equal("domain" in options, false);

// Share link: the code goes only into the fragment.
assert.equal(pointDeviceLink("https://business.audiolad.ru", "business.audiolad.ru", "4719"), "https://business.audiolad.ru/point#4719");
assert.equal(pointDeviceLink("https://business.audiolad.ru/", "business.audiolad.ru", null), "https://business.audiolad.ru/point");
assert.equal(pointDeviceLink("http://localhost:3000", "localhost", "4719"), "http://localhost:3000/business-app/point#4719");
assert.equal(pointDeviceLink("https://business.audiolad.ru", "business.audiolad.ru", "bad"), "https://business.audiolad.ru/point");
assert.ok(!new URL(pointDeviceLink("https://business.audiolad.ru", "business.audiolad.ru", "4719")).search.includes("4719"));
const link = pointDeviceLink("https://business.audiolad.ru", "business.audiolad.ru", "4719");
const text = pointShareText("4719");
assert.match(text, /кофейне/);
assert.match(text, /действует 20 минут/);
assert.doesNotMatch(text, /точк/i);
assert.doesNotMatch(text, /\u2014/);
assert.ok(pointTelegramShareUrl(link, text).startsWith("https://t.me/share/url?url=https%3A%2F%2Fbusiness.audiolad.ru%2Fpoint%234719&text="));
assert.ok(pointMailtoUrl(link, text).startsWith("mailto:?subject="));
assert.ok(decodeURIComponent(pointMailtoUrl(link, text)).includes(link));

assert.equal(pointCodeSecondsLeft("2026-10-29T08:20:00.000Z", Date.parse("2026-10-29T08:00:00.000Z")), 1200);
assert.equal(pointCodeSecondsLeft("2026-10-29T08:00:00.000Z", Date.parse("2026-10-29T08:00:01.000Z")), 0);
assert.equal(pointCodeSecondsLeft(null, 0), 0);
// Countdown from the server's seconds left, not the phone clock.
assert.equal(pointCodeDeadline(1200, "2000-01-01T00:00:00.000Z", 5_000), 5_000 + 1_200_000);
assert.equal(pointCodeDeadline(undefined, "2026-10-29T08:20:00.000Z", 0), Date.parse("2026-10-29T08:20:00.000Z"));
assert.equal(pointCodeDeadline(-5, null, 7), 7);
assert.equal(pointWaitMinutes(30), "1 минуту");
assert.equal(pointWaitMinutes(130), "3 минуты");
assert.equal(pointWaitMinutes(600), "10 минут");
assert.equal(pointWaitMinutes(21 * 60), "21 минуту");

// Redeem answers.
const ok = pointJoinResult({ ok: true, token: "a".repeat(64), location_name: "Кофейня" });
assert.equal(ok.ok, true);
const wrong = pointJoinResult({ ok: false, reason: "invalid_point_code", attempts_left: 3 });
assert.equal(wrong.ok, false);
if (!wrong.ok) assert.equal(wrong.error, POINT_JOIN_WRONG);
const locked = pointJoinResult({ ok: false, reason: "too_many_attempts", retry_after: 290 });
assert.equal(locked.ok, false);
if (!locked.ok) {
  assert.equal(locked.status, 429);
  assert.match(locked.error, /Подождите 5 минут/);
}
const broken = pointJoinResult(null);
assert.equal(broken.ok, false);
if (!broken.ok) assert.equal(broken.status, 503);
assert.equal(pointJoinResult({ ok: true, token: "short" }).ok, false, "a bad token is never set");

// Route: join goes through the server-only redeem with the trusted client IP.
const route = readFileSync(new URL("../src/app/api/business/point/route.ts", import.meta.url), "utf8");
assert.match(route, /createServiceRoleClient\(\)/);
assert.match(route, /"redeem_business_point_pairing"/);
assert.match(route, /const clientIp = getTrustedClientIp\(request\)[\s\S]*p_client_key: clientIp/);
assert.doesNotMatch(route, /"consume_business_point_pairing"/);
assert.match(route, /expiresIn: pointCodeSecondsLeft\(payload\.expires_at, Date\.now\(\)\)/);
assert.match(route, /pointClientIpCollapsed\(clientIp\)/);
assert.equal(pointClientIpCollapsed("unknown"), true);
assert.equal(pointClientIpCollapsed("127.0.0.1"), true);
assert.equal(pointClientIpCollapsed("::1"), true);
assert.equal(pointClientIpCollapsed("::ffff:127.0.0.1"), true);
assert.equal(pointClientIpCollapsed("203.0.113.7"), false);

// Device page: numeric keypad, 4 digits, fragment cleared.
const page = readFileSync(new URL("../src/app/business-app/point/page.tsx", import.meta.url), "utf8");
assert.match(page, /inputMode="numeric"/);
assert.match(page, /Код действует 20 минут/);
assert.match(readFileSync(new URL("../src/components/business-app/PointPairingCard.tsx", import.meta.url), "utf8"), /действует 20 минут/);
assert.match(page, /pattern="\[0-9\]\{4\}"/);
assert.match(page, /autoComplete="one-time-code"/);
assert.match(page, /window\.history\.replaceState/);
assert.match(page, /beforeinstallprompt/);
assert.match(page, /Добавьте на экран «Домой», чтобы открывать в одно касание/);

// Owner card: Web Share first, local QR, fallbacks.
const card = readFileSync(new URL("../src/components/business-app/PointPairingCard.tsx", import.meta.url), "utf8");
assert.match(card, /Поделиться ссылкой на устройство/);
assert.match(card, /nav\.share\(/);
assert.match(card, /Скопировать ссылку/);
assert.match(card, /pointTelegramShareUrl/);
assert.match(card, /pointMailtoUrl/);
assert.match(card, /<PointQrCode/);
assert.match(card, /pointCodeDeadline\(json\.expiresIn/);
assert.match(card, /скопируйте её вручную/);
const qr = readFileSync(new URL("../src/components/business-app/PointQrCode.tsx", import.meta.url), "utf8");
assert.match(qr, /from "qrcode-generator"/);
assert.doesNotMatch(qr, /https?:\/\//, "QR is drawn locally");
const home = readFileSync(new URL("../src/components/business-app/BusinessHomePage.tsx", import.meta.url), "utf8");
assert.match(home, /Подключить устройство в зале/);
for (const source of [page, card, home]) {
  assert.doesNotMatch(source, /\u2014/, "en dash only");
}

console.log("business-point-pairing-unit: ok");
