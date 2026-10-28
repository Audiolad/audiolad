/**
 * Public venue licence page and printable sticker (task 90d24628).
 * The route is off unless AUDIOLAD_BUSINESS_VENUE_LICENCE_PUBLIC=1.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import BusinessAppShell from "../src/components/business-app/BusinessAppShell";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import VenueLicencePage from "../src/components/business-app/venue-licence/VenueLicencePage";
import { BUSINESS_SUBSCRIPTION_NOTE, BUSINESS_UNCONFIRMED_NOTE } from "../src/lib/access-grants/copy";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import { isVenueLicencePublicEnabled, VENUE_LICENCE_PUBLIC_KEY } from "../src/lib/business-app/venue-licence/flag";
import { formatVenueAddress, formatVenueName, presentVenueLicence } from "../src/lib/business-app/venue-licence/present";
import { QR_MATRIX_SIZE, qrMatrix } from "../src/lib/business-app/venue-licence/qr";
import {
  sampleVenueLicence,
  VENUE_LICENCE_SAMPLE_EMAIL_HASH,
  VENUE_LICENCE_SAMPLE_IDS,
  VENUE_LICENCE_SAMPLE_USER_ID,
} from "../src/lib/business-app/venue-licence/samples";
import { renderVenueStickerSvg, STICKER_BRAND, STICKER_HEADLINE, STICKER_SCOPE, stickerPageSizeMm } from "../src/lib/business-app/venue-licence/sticker";
import { venueLicencePublicUrl } from "../src/lib/business-app/host";

assert.equal(isVenueLicencePublicEnabled({}), false);
assert.equal(isVenueLicencePublicEnabled({ [VENUE_LICENCE_PUBLIC_KEY]: "true" }), false);
assert.equal(isVenueLicencePublicEnabled({ [VENUE_LICENCE_PUBLIC_KEY]: "1" }), true);

assert.equal(formatVenueName({ locationName: "  Зал  " }), "Зал");
assert.equal(formatVenueName({ locationName: "Зал", venueName: " Кофейня " }), "Кофейня");
assert.equal(
  formatVenueAddress({ locationName: "Зал", postalCode: "101000", city: "Москва", addressLine1: "ул. Примерная, д. 1" }),
  "101000, Москва, ул. Примерная, д. 1",
);
assert.equal(
  formatVenueAddress({ locationName: "Зал", city: "Москва", venueAddress: "г. Образец, ул. Примерная, д. 1" }),
  "г. Образец, ул. Примерная, д. 1",
);
assert.equal(formatVenueAddress({ locationName: "Зал" }), null);

// The fixture grants really carry these values, so the leak check below can fail.
const secret = VENUE_LICENCE_SAMPLE_EMAIL_HASH;
const userId = VENUE_LICENCE_SAMPLE_USER_ID;
assert.match(userId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.match(secret, /^[0-9a-f]{64}$/);

function leaks(view: unknown): string[] {
  const raw = JSON.stringify(view);
  const found: string[] = [];
  if (raw.includes(secret)) found.push("email hash");
  if (raw.includes(userId)) found.push("user id");
  if (raw.includes("@")) found.push("email");
  return found;
}

// The check itself must catch a leak of the fixture identity.
assert.deepEqual(leaks({ owner: userId }), ["user id"]);
assert.deepEqual(leaks({ hash: secret }), ["email hash"]);
assert.deepEqual(leaks({ email: "owner@example.invalid" }), ["email"]);

function viewOf(id: keyof typeof VENUE_LICENCE_SAMPLE_IDS) {
  const view = sampleVenueLicence(VENUE_LICENCE_SAMPLE_IDS[id]);
  assert.ok(view, id);
  assert.deepEqual(leaks(view), [], `${id} must not carry the owner email, its hash or the user id`);
  return view;
}

const trial = viewOf("trial");
assert.equal(trial.status, "trial");
assert.equal(trial.clock, "gift");
assert.equal(trial.venueName, "Образец кофейни");
assert.match(trial.address ?? "", /ул\. Примерная/);
assert.ok(trial.periodStartLabel && trial.periodEndLabel);

const paid = viewOf("paid");
assert.equal(paid.status, "paid");
assert.equal(paid.clock, "subscription");

const grace = viewOf("grace");
assert.equal(grace.status, "grace");
assert.equal(grace.clock, "gift");
assert.equal(grace.graceDaysLeft, 1);

const expired = viewOf("expired");
assert.equal(expired.status, "expired");
assert.equal(expired.clock, "gift");

const expiredPaid = viewOf("expiredSubscription");
assert.equal(expiredPaid.status, "expired");
assert.equal(expiredPaid.clock, "subscription");

const notStarted = viewOf("notStarted");
assert.equal(notStarted.status, "not_started");
assert.equal(notStarted.address, null);
assert.equal(notStarted.periodEndLabel, null);

const manual = presentVenueLicence({
  publicId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  place: { locationName: "Зал" },
  now: new Date("2026-10-28T09:00:00.000Z"),
  grant: null,
  paidUntil: null,
  paidPeriod: null,
});
assert.equal(manual.status, "not_started");

function htmlOf(id: keyof typeof VENUE_LICENCE_SAMPLE_IDS) {
  const html = renderToStaticMarkup(<VenueLicencePage view={viewOf(id)} />);
  assert.equal(html.includes("\u2014"), false, `${id} contains an em dash`);
  assert.equal(html.includes(secret), false, `${id} renders the email hash`);
  assert.equal(html.includes(userId), false, `${id} renders the user id`);
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    assert.ok(
      href.startsWith("/") || href === "mailto:1@audiolad.ru",
      `${id} unexpected link ${href}`,
    );
    assert.equal(href.startsWith("//"), false, href);
  }
  assert.match(html, /Что получает клиент/);
  assert.match(html, /в конкретной точке/);
  assert.match(html, /Лицензия не освобождает от выплат/);
  assert.match(html, /ИП Петров Сергей Сергеевич/);
  assert.doesNotMatch(html, /https?:\/\//);
  return html;
}

const trialHtml = htmlOf("trial");
assert.match(trialHtml, /data-status="trial"/);
assert.match(trialHtml, /30 дней в подарок/);
assert.match(trialHtml, /Бесплатный доступ до /);
assert.match(trialHtml, /Образец кофейни/);

const paidHtml = htmlOf("paid");
assert.match(paidHtml, /data-status="paid"/);
assert.match(paidHtml, /Подписка до /);
assert.doesNotMatch(paidHtml, /Подарочный период закончился/);

const graceHtml = htmlOf("grace");
assert.match(graceHtml, /data-status="grace"/);
assert.match(graceHtml, /Срок закончился/);
assert.match(graceHtml, /Музыка играет ещё 1 день, затем остановится/);

const expiredHtml = htmlOf("expired");
assert.match(expiredHtml, /data-status="expired"/);
assert.match(expiredHtml, /Подарочный период закончился/);
assert.match(expiredHtml, new RegExp(BUSINESS_SUBSCRIPTION_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const expiredPaidHtml = htmlOf("expiredSubscription");
assert.match(expiredPaidHtml, /data-status="expired"/);
assert.match(expiredPaidHtml, /Подписка до /);
assert.match(expiredPaidHtml, /По окончании доступа воспроизведение прекращается/);
assert.doesNotMatch(expiredPaidHtml, /Подарочный период закончился/);

const emptyHtml = htmlOf("notStarted");
assert.match(emptyHtml, /data-status="not_started"/);
assert.match(emptyHtml, new RegExp(BUSINESS_UNCONFIRMED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(emptyHtml, /Адрес точки пока не указан/);

const url = venueLicencePublicUrl(VENUE_LICENCE_SAMPLE_IDS.trial);
const square = renderVenueStickerSvg({ publicUrl: url, format: "square80" });
const tent = renderVenueStickerSvg({ publicUrl: url, format: "a6" });
assert.match(square, new RegExp(`width="86mm"`));
assert.match(tent, new RegExp(`width="111mm"`));
assert.match(tent, /height="154mm"/);
assert.deepEqual(stickerPageSizeMm("square80"), { width: 86, height: 86 });
assert.deepEqual(stickerPageSizeMm("a6"), { width: 111, height: 154 });
for (const svg of [square, tent]) {
  const text = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1]).join(" ");
  assert.ok(text.includes(STICKER_HEADLINE), "headline");
  assert.ok(text.includes(STICKER_SCOPE), "scope");
  assert.ok(text.includes(STICKER_BRAND), "brand");
  assert.equal(svg.includes("\u2014"), false);
  assert.equal(svg.includes(url), false, "the URL is inside the QR, not printed");
  assert.ok((svg.match(/<rect /g) ?? []).length > 100, "QR modules are vector rects");
  const baselines = [...svg.matchAll(/<text x="[^"]+" y="([^"]+)"/g)].map((match) => Number(match[1]));
  const limit = svg.includes('width="86mm"') ? 78 : 148;
  assert.ok(Math.max(...baselines) < limit, `text stays inside the trim, last ${Math.max(...baselines)}`);
}

// Exercise the logo branch: every namespace prefix in an element/attribute must be declared.
for (const format of ["square80", "a6"] as const) {
  const svg = renderVenueStickerSvg({ publicUrl: url, format, logoHref: "data:image/svg+xml;base64,PHN2Zy8+" });
  assert.match(svg, /<image href="data:image\/svg\+xml;base64,PHN2Zy8\+"/);
  assert.doesNotMatch(svg, /xlink:href/);
  const declared = new Set(["xml", "xmlns", ...[...svg.matchAll(/xmlns:([\w-]+)=/g)].map((m) => m[1])]);
  for (const match of svg.matchAll(/(?:<\/?|\s)([\w-]+):[\w-]+(?=[\s=>])/g)) {
    assert.ok(declared.has(match[1]), `undeclared XML prefix ${match[1]}`);
  }
}

const matrix = qrMatrix(url);
assert.equal(matrix.length, QR_MATRIX_SIZE);
assert.equal(matrix[0].length, QR_MATRIX_SIZE);
assert.equal(matrix[0][0], true);
assert.equal(matrix[0][SIZE_EDGE(matrix)], true);

function SIZE_EDGE(modules: boolean[][]): number {
  return modules.length - 1;
}

const anonymous: BusinessOwnerHomeContext = { status: "anonymous" };
const fakeRouter = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} } as never;
const home = renderToStaticMarkup(
  <AppRouterContext.Provider value={fakeRouter}>
    <PathnameContext.Provider value="/business-app">
      <BusinessDomainProvider value={anonymous}>
        <BusinessAppShell><p>home</p></BusinessAppShell>
      </BusinessDomainProvider>
    </PathnameContext.Provider>
  </AppRouterContext.Provider>,
);
assert.match(home, /business-app-sidebar/);
assert.doesNotMatch(home, /venue-licence-frame/);

const pageSource = readFileSync("src/app/(venue-licence)/business-venue-licence/v/[publicId]/page.tsx", "utf8");
assert.match(pageSource, /isVenueLicencePublicEnabled\(\)/);
assert.match(pageSource, /notFound\(\)/);
const migration = readFileSync("supabase/migrations/20270207170000_business_location_licence_public_id.sql", "utf8");
assert.match(migration, /ADD COLUMN IF NOT EXISTS licence_public_id/);
assert.match(migration, /licence_public_id ~ '\^\[0-9a-f\]\{32\}\$'/);
assert.doesNotMatch(migration, /DROP TABLE/i);

console.log("business-venue-licence-unit: ok");
