import { readFileSync } from "node:fs";
import BusinessSupportDiagnosticPage from "../src/components/business-app/BusinessSupportDiagnosticPage";
import { anonymousSupportDiagnostics, buildSupportDiagnostics } from "../src/lib/business-app/support-diagnostics";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { BusinessChromeAccessProvider } from "../src/components/business-app/BusinessAccessLine";
import BusinessHomePage, { type BusinessHomePageProps } from "../src/components/business-app/BusinessHomePage";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { businessGiftRulesText } from "../src/lib/access-grants/copy";
import { formatMoscowDateTime, ruDaysWord, trialDaysLeft } from "../src/lib/access-grants/policy";
import { formatBusinessMonthlyPrice } from "../src/lib/business/plan";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import { emptyBusinessOwnerHomeSignals } from "../src/lib/business-app/owner-home-signals";

const context: Extract<BusinessOwnerHomeContext, { status: "authenticated" }> = {
  status: "authenticated",
  owner: { userId: "owner", firstName: "Анна" },
  organizationId: "org", organizationName: "Организация",
  location: { id: "loc", organizationId: "org", name: "Тестовая точка", businessCategory: "spa", countryCode: "RU", timezone: "Europe/Moscow", status: "active", defaultZoneId: null },
  signals: { ...emptyBusinessOwnerHomeSignals(), playerCount: 1, primaryHealthStatus: "online", secondsSinceHeartbeat: 30 },
};
const render = (signals = context.signals, props: BusinessHomePageProps = {}) => renderToStaticMarkup(
  <AppRouterContext.Provider value={fakeRouter}>
    <BusinessDomainProvider value={{ ...context, signals }}><BusinessHomePage {...props} /></BusinessDomainProvider>
  </AppRouterContext.Provider>,
);
// Live refresh (c02fe282) uses router.refresh(); SSR render needs an app router.
const fakeRouter = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} } as never;
assert.match(readFileSync("src/components/business-app/BusinessHomePage.tsx", "utf8"), /<BusinessOwnerHomeLiveRefresh \/>/);
const track = { title: "Реальный трек", coverUrl: "/real-cover.webp" };
for (const signals of [null, emptyBusinessOwnerHomeSignals(), context.signals, { ...context.signals!, secondsSinceHeartbeat: 301 }, { ...context.signals!, lastBusinessPlayAt: new Date().toISOString(), lastPlayMinutesAgo: 0 }]) {
  const html = render(signals, { currentTrack: track });
  assert.match(html, /Тестовая точка/);
  assert.match(html, /Последний сигнал от плеера/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Воспроизведение не подтверждено/);
  assert.match(html, /Название трека появится, когда плеер сообщит, что музыка играет./);
  assert.match(html, /Лицензия: нет подтверждённых данных/);
  assert.match(html, /href="\/music"/);
  assert.match(html, /Открыть музыку/);
  assert.match(html, /href="\/help"[^>]*>Проверить работу музыки<\/a>/);
  assert.doesNotMatch(html, /Диагностика для поддержки/);
  assert.equal((html.match(/data-testid="owner-home-overall-status"/g) ?? []).length, 1);
  assert.match(html, /<details class="business-app-owner-signal-details"><summary[^>]*>Подробнее<\/summary><ul[^>]*>[\s\S]*?<li[^>]*><strong>[^<]+<\/strong>[\s\S]*?<li[^>]*><strong>Воспроизведение[\s\S]*?<\/ul><\/details>/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.doesNotMatch(html, /Реальный трек|real-cover|Музыка играет|data-tone="error"|Лицензия активна/);
  for (const label of ["Атмосфера", "Следующая смена музыкального дня", "История звучания", "скоро"]) {
    assert.equal(html.includes(label), false, label);
  }
  assert.equal((html.match(/<section[^>]*aria-disabled="true"/g) ?? []).length, 0);
}
assert.match(render(null), /Нет данных о плеере/);
assert.match(render(context.signals), /Плеер на связи/);
assert.match(render({ ...context.signals!, secondsSinceHeartbeat: 301 }), /Нет связи с плеером/);
assert.match(render({ ...context.signals!, lastPlayMinutesAgo: 2 }), /Последнее воспроизведение: 2 мин назад/);
const nowMs = Date.parse("2026-10-14T12:00:00Z");
const confirmed = { nowMs, playbackState: "playing" as const, playbackConfirmedAt: new Date(nowMs).toISOString() };
assert.match(render(context.signals, { currentTrack: track, playbackConfirmation: confirmed }), /Реальный трек/);
assert.match(render(context.signals, { currentTrack: track, playbackConfirmation: confirmed }), /src="\/real-cover.webp"/);
for (const playbackConfirmation of [{ ...confirmed, playbackState: "paused" as const }, { ...confirmed, playbackConfirmedAt: new Date(nowMs - 301_000).toISOString() }, { ...confirmed, errorConfirmed: true }]) {
  assert.doesNotMatch(render(context.signals, { currentTrack: track, playbackConfirmation }), /Реальный трек|real-cover/);
}
assert.match(render(context.signals, { playbackConfirmation: { nowMs, errorConfirmed: true } }), /data-tone="error"/);
// Part B: live state from the /spa player.
const fresh = new Date().toISOString();
const live = { ...emptyBusinessOwnerHomeSignals(), lastSeenSeconds: 20, liveConnected: true, playbackState: "playing" as const, playbackConfirmedAt: fresh, playbackConfirmedSecondsAgo: 20, currentTrack: { title: "Живой трек" } };
const liveHtml = render(live);
assert.match(liveHtml, /Плеер на связи/);
assert.match(liveHtml, /Воспроизведение подтверждено/);
assert.match(liveHtml, /Живой трек/);
const notConfirmed = render({ ...live, playbackConfirmedAt: null });
assert.match(notConfirmed, /Воспроизведение не подтверждено/);
assert.doesNotMatch(notConfirmed, /Живой трек/);
const lost = render({ ...live, lastSeenSeconds: 900, liveConnected: false, playbackConfirmedAt: new Date(Date.now() - 900_000).toISOString(), playbackConfirmedSecondsAgo: 900 });
assert.match(lost, /Нет связи с плеером/);
assert.doesNotMatch(lost, /data-tone="error"|Живой трек|остановлен/);
assert.match(render({ ...live, playbackState: "error" }), /data-tone="error"/);
assert.doesNotMatch(render({ ...live, playbackState: "error", lastSeenSeconds: 900, liveConnected: false }), /data-tone="error"/);
assert.match(render({ ...context.signals!, secondsSinceHeartbeat: 0 }), /Последний сигнал от плеера: только что/);
assert.match(render({ ...context.signals!, secondsSinceHeartbeat: 29 }), /Последний сигнал от плеера: только что/);
assert.match(render(context.signals), /Последний сигнал от плеера: меньше минуты назад/);
assert.match(render(context.signals, { playbackConfirmation: confirmed }), /data-testid="owner-home-overall-status">Музыка играет – воспроизведение подтверждено/);
assert.match(render(context.signals, { playbackConfirmation: { nowMs, errorConfirmed: true } }), /data-testid="owner-home-overall-status">Сбой воспроизведения подтверждён/);
const css = readFileSync(new URL("../src/components/business-app/business-app.css", import.meta.url), "utf8");
assert.match(css, /\.business-app-owner-desktop-signals\s*\{\s*display: none;/);
assert.match(css, /@media \(min-width: 768px\)\s*\{\s*\.business-app-owner-compact-status\s*\{\s*display: none;\s*\}\s*\.business-app-owner-desktop-signals\s*\{\s*display: grid;/);
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
const trialDays = trialDaysLeft(new Date(trialEnds), new Date());
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
assert.match(trialHome, /30 дней в подарок/);
assert.match(trialHome, new RegExp(`Осталось ${trialDays} ${ruDaysWord(trialDays)}`));
assert.ok(trialHome.includes(`до ${formatMoscowDateTime(new Date(trialEnds))}`));
assert.ok(trialHome.includes(businessGiftRulesText()));
assert.match(trialHome, /безлимитн/);
assert.match(trialHome, /3 часов/);
assert.doesNotMatch(trialHome, /—/);
const paidHome = withAccess({ mode: "paid", endsAt: "2026-12-31T10:00:00.000Z" });
assert.match(paidHome, /data-mode="paid"/);
assert.ok(paidHome.includes(`Подписка до ${formatMoscowDateTime(new Date("2026-12-31T10:00:00.000Z"))}`));
const endedHome = withAccess({ mode: "offer", endsAt: trialEnds });
assert.match(endedHome, /id="dostup"/);
assert.match(endedHome, /Подарочный период закончился/);
assert.match(endedHome, new RegExp(formatBusinessMonthlyPrice().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(" ", "\\s")));
assert.match(endedHome, /в месяц/);
assert.match(endedHome, /ничего не списывает/);
assert.match(endedHome, /data-testid="biz-home-subscribe"/);
assert.match(endedHome, /Оформить подписку/);
assert.ok(endedHome.includes(businessGiftRulesText()));
assert.doesNotMatch(withAccess({ mode: "offer", endsAt: null }), /data-testid="biz-home-access"/, "no grant is not a finished trial");
console.log("business-app-owner-home-render-unit: ok");
