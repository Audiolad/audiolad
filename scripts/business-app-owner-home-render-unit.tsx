import { readFileSync } from "node:fs";
import BusinessSupportDiagnosticPage from "../src/components/business-app/BusinessSupportDiagnosticPage";
import { anonymousSupportDiagnostics, buildSupportDiagnostics } from "../src/lib/business-app/support-diagnostics";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { BusinessChromeAccessProvider } from "../src/components/business-app/BusinessAccessLine";
import BusinessHomePage, { type BusinessHomePageProps } from "../src/components/business-app/BusinessHomePage";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { BUSINESS_GIFT_CLOSING_NOTE, BUSINESS_GIFT_LICENSE_NOTE, BUSINESS_GIFT_TITLE, businessGiftPriceNote } from "../src/lib/access-grants/copy";
import { assertNoForbiddenGiftText, visibleLines } from "./business-gift-copy-guard";
import { formatMoscowDateTime } from "../src/lib/access-grants/policy";
import { BUSINESS_OFFER_TITLE } from "../src/lib/business/offer";
import { formatBusinessMonthlyPrice } from "../src/lib/business/plan";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import { emptyBusinessOwnerHomeSignals } from "../src/lib/business-app/owner-home-signals";

const context: Extract<BusinessOwnerHomeContext, { status: "authenticated" }> = {
  status: "authenticated",
  owner: { userId: "owner", firstName: "Анна" },
  organizationId: "org", organizationName: "Организация",
  location: { id: "loc", organizationId: "org", name: "Тестовая точка", businessCategory: "spa", countryCode: "RU", timezone: "Europe/Moscow", status: "active", defaultZoneId: null },
  canPay: true,
  offerAccepted: true,
  signals: { ...emptyBusinessOwnerHomeSignals(), playerCount: 1, primaryHealthStatus: "online", secondsSinceHeartbeat: 30 },
};
const render = (signals = context.signals, props: BusinessHomePageProps = {}) => renderToStaticMarkup(
  <AppRouterContext.Provider value={fakeRouter}>
    <BusinessDomainProvider value={{ ...context, signals }}><BusinessHomePage {...props} /></BusinessDomainProvider>
  </AppRouterContext.Provider>,
);
// Live refresh (c02fe282) uses router.refresh(); SSR render needs an app router.
const fakeRouter = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} } as never;
// Live refresh moved from the home page into the shell (every cabinet screen, 3 s, 30.10.2026).
assert.doesNotMatch(readFileSync("src/components/business-app/BusinessHomePage.tsx", "utf8"), /BusinessOwnerHomeLiveRefresh/);
assert.match(readFileSync("src/components/business-app/BusinessAppShell.tsx", "utf8"), /<BusinessLiveRefresh enabled=/);
// Главная «С чего начать» (03.11.2026): a checklist, no venue controls and no status board.
const home = readFileSync("src/components/business-app/BusinessHomePage.tsx", "utf8");
assert.doesNotMatch(home, /VenueControlPanel|StatusBanner|Слушать у себя|Устройство у колонки|Сейчас звучит/);
assert.doesNotMatch(home, /<a\s+href="\/music"/, "client navigation keeps the cabinet player playing");
for (const signals of [null, emptyBusinessOwnerHomeSignals(), context.signals, { ...context.signals!, secondsSinceHeartbeat: 301 }]) {
  const html = render(signals);
  assert.match(html, /<h2[^>]*>С чего начать<\/h2>/);
  assert.match(html, /<ol class="business-app-steps/);
  assert.match(html, /Включите музыку/);
  assert.match(html, /href="\/music"[^>]*>[\s\S]*?Открыть музыку<\/a>/);
  assert.match(html, /Подключите устройство в зале/);
  assert.match(html, /href="\/preferences#device"[^>]*>[\s\S]*?Открыть настройку<\/a>/);
  assert.match(html, /Посмотрите документы/);
  assert.match(html, /href="\/documents"[^>]*>[\s\S]*?Открыть документы<\/a>/);
  assert.match(html, /data-step="music" data-done="false"/);
  assert.match(html, /data-step="device" data-done="unknown"/);
  assert.match(html, /data-step="documents" data-done="unknown"/);
  assert.match(html, /business-app-btn-cta/);
  for (const label of ["Пауза в зале", "Разрешить менять музыку", "Сохранить название", "Изменить звучание", "Последний сигнал от плеера", "Лицензия: нет подтверждённых данных", "data-tone=\"error\"", "Нет связи"]) {
    assert.equal(html.includes(label), false, label);
  }
  assert.doesNotMatch(html, /https?:\/\//, "no external links");
  assert.doesNotMatch(html, /\u2014/);
}
assert.match(render({ ...context.signals!, lastPlayMinutesAgo: 2 }), /data-step="music" data-done="true"[\s\S]*?Музыка уже звучала в кабинете\./);
const nowMs = Date.parse("2026-10-14T12:00:00Z");
const confirmed = { nowMs, playbackState: "playing" as const, playbackConfirmedAt: new Date(nowMs).toISOString() };
assert.match(render(context.signals, { playbackConfirmation: confirmed }), /data-step="music" data-done="true"/);
assert.match(render(context.signals, { playbackConfirmation: { nowMs, errorConfirmed: true } }), /data-step="music" data-done="false"/);
assert.match(render(context.signals, { pointLinked: true }), /data-step="device" data-done="true"[\s\S]*?Устройство в зале подключено\./);
assert.match(render(context.signals, { pointLinked: false }), /data-step="device" data-done="false"/);
assert.match(render(context.signals, { pointLinked: true }), /aria-label="Готово"/);
const css = readFileSync(new URL("../src/components/business-app/business-app.css", import.meta.url), "utf8");
assert.match(css, /\.business-app-step-mark\[data-done="true"\]\s*\{\s*background: var\(--biz-play\);/);
assert.doesNotMatch(css, /business-app-owner-signals|business-app-owner-compact-status/);
for (const diagnostics of [anonymousSupportDiagnostics(), buildSupportDiagnostics({ hasUser: true, organizationId: "org", organizationName: "Организация", location: null, players: [{ playerId: "p", playerCode: "Плеер 1", displayName: null, playerStatus: "active", healthStatus: "online", secondsSinceHeartbeat: 12, lastHeartbeatAt: null, locationId: null, zoneId: null }], lastPlay: { occurredAt: "2026-10-14T12:00:00Z", minutesAgo: 0, audioItemId: null, playerId: "p", locationId: null } })]) {
  const html = renderToStaticMarkup(<BusinessSupportDiagnosticPage diagnostics={diagnostics} />);
  assert.match(html, /<h1[^>]*>Проверить работу музыки<\/h1>/);
  for (const text of ["Воспроизведение не подтверждено", "Нет подтверждённых данных", "Количество плееров", "Последнее воспроизведение"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /is-stopped|is-healthy|biz-red-bg|Музыка играет/);
  if (diagnostics.players.length) {
    assert.match(html, /Плеер на связи/);
    assert.match(html, /Последний сигнал от плеера<\/dt><dd[^>]*>только что/);
  } else assert.match(html, /Нет данных о плеерах/);
}
assert.doesNotMatch(render(), /data-testid="biz-home-access"/, "no trial card without a live or ended period");
const trialEnds = "2026-11-22T14:11:37.762Z";
const withAccess = (access: { mode: "trial" | "paid" | "offer"; endsAt: string | null }) => renderToStaticMarkup(
  <AppRouterContext.Provider value={fakeRouter}>
    <BusinessDomainProvider value={context}>
      <BusinessChromeAccessProvider value={access}>
        <BusinessHomePage />
      </BusinessChromeAccessProvider>
    </BusinessDomainProvider>
  </AppRouterContext.Provider>,
);
const trialHome = withAccess({ mode: "trial", endsAt: trialEnds });
assert.match(trialHome, /data-testid="biz-home-access"/);
assert.equal(BUSINESS_GIFT_TITLE, "7 дней в подарок");
assert.equal(BUSINESS_GIFT_CLOSING_NOTE, "После 7 подарочных дней нужна оплата, чтобы музыка продолжала играть.");
assert.equal(BUSINESS_GIFT_LICENSE_NOTE, "В 7 подарочных дней входят все права и лицензия на музыку для вашего заведения.");
assert.equal(businessGiftPriceNote(), `${formatBusinessMonthlyPrice()} за 30 дней, картой или по СБП. Автосписания нет.`);
assert.match(formatBusinessMonthlyPrice(), /^799\s₽$/u);
const stepOf = (html: string, id: string) => {
  const start = html.lastIndexOf("<li", html.indexOf(`data-step="${id}"`));
  assert.ok(start >= 0, id);
  return html.slice(start, html.indexOf("</li>", start) + "</li>".length);
};
// Terms step: accepted already, the offer stays one tap away.
const termsStep = stepOf(trialHome, "terms");
assert.deepEqual(visibleLines(termsStep), ["Примите условия", "Условия приняты для всего аккаунта:", `«${BUSINESS_OFFER_TITLE}»`, "."]);
assert.match(termsStep, /target="_blank"/);
assert.match(termsStep, /data-done="true"/);
assert.match(termsStep, /href="\/documents\/b2b-terms"/);
// Pay step: exactly these lines, in this order.
const trialCard = stepOf(trialHome, "pay");
assert.match(trialCard, /id="dostup"/);
assert.match(trialCard, /data-mode="trial"/);
assert.deepEqual(visibleLines(trialCard), [
  "5",
  "Оплатите подписку",
  "После 7 подарочных дней нужна оплата, чтобы музыка продолжала играть.",
  "В 7 подарочных дней входят все права и лицензия на музыку для вашего заведения.",
  `${formatBusinessMonthlyPrice()} за 30 дней, картой или по СБП. Автосписания нет.`,
  "Оплатить",
]);
assert.equal(trialCard.split(BUSINESS_GIFT_LICENSE_NOTE).length, 2, "licence text once");
assert.match(trialCard, /data-testid="biz-home-pay-button"[^>]*>Оплатить|class="business-app-btn business-app-btn-cta[^"]*"[^>]*data-testid="biz-home-pay-button"/);
assertNoForbiddenGiftText(visibleLines(trialHome).join("\n"), "home", [
  ["gift title", /7 дней в подарок/],
  ["old rules", /один раз на подтверждённый адрес|без карты и без автосписания|Генерация музыки|Пределы|Гостевой проект|круглую кнопку|«Играть»/i],
  ["grace", /3 дн|три дня|льготн/i],
]);
// Not accepted yet: accept in the terms step, the pay step waits for it.
const notAccepted = renderToStaticMarkup(
  <AppRouterContext.Provider value={fakeRouter}>
    <BusinessDomainProvider value={{ ...context, offerAccepted: false }}>
      <BusinessChromeAccessProvider value={{ mode: "trial", endsAt: trialEnds }}>
        <BusinessHomePage />
      </BusinessChromeAccessProvider>
    </BusinessDomainProvider>
  </AppRouterContext.Provider>,
);
assert.match(stepOf(notAccepted, "terms"), /data-testid="biz-home-accept"/);
assert.match(stepOf(notAccepted, "terms"), /business-app-btn-cta/);
assert.doesNotMatch(notAccepted, /biz-home-pay-button/);
assert.match(stepOf(notAccepted, "pay"), /Кнопка оплаты появится, когда вы примете условия – шаг выше\./);
// A manager sees no terms and pay steps.
const manager = renderToStaticMarkup(
  <AppRouterContext.Provider value={fakeRouter}>
    <BusinessDomainProvider value={{ ...context, canPay: false }}>
      <BusinessChromeAccessProvider value={{ mode: "trial", endsAt: trialEnds }}>
        <BusinessHomePage />
      </BusinessChromeAccessProvider>
    </BusinessDomainProvider>
  </AppRouterContext.Provider>,
);
assert.doesNotMatch(manager, /data-step="terms"|data-step="pay"|biz-home-access/);
const paidHome = withAccess({ mode: "paid", endsAt: "2026-12-31T10:00:00.000Z" });
assert.match(paidHome, /data-mode="paid"/);
assert.match(stepOf(paidHome, "pay"), /data-done="true"/);
assert.ok(paidHome.includes(`Подписка до ${formatMoscowDateTime(new Date("2026-12-31T10:00:00.000Z"))}`));
const endedHome = withAccess({ mode: "offer", endsAt: trialEnds });
assert.match(endedHome, /id="dostup"/);
assert.match(endedHome, /Подарочный период закончился/);
assert.match(endedHome, new RegExp(formatBusinessMonthlyPrice().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(" ", "\\s")));
assert.match(endedHome, /за 30 дней/);
assert.match(endedHome, /без автосписания/);
assert.match(endedHome, /data-testid="biz-home-pay-button"/);
assert.match(endedHome, /Оплатить/);
assert.doesNotMatch(endedHome, /\u2014/);
assert.doesNotMatch(withAccess({ mode: "offer", endsAt: null }), /data-testid="biz-home-access"/, "no grant is not a finished trial");
console.log("business-app-owner-home-render-unit: ok");
