import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import BusinessHomePage, { type BusinessHomePageProps } from "../src/components/business-app/BusinessHomePage";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
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
  <BusinessDomainProvider value={{ ...context, signals }}><BusinessHomePage {...props} /></BusinessDomainProvider>,
);
const track = { title: "Реальный трек", coverUrl: "/real-cover.webp" };
for (const signals of [null, emptyBusinessOwnerHomeSignals(), context.signals, { ...context.signals!, secondsSinceHeartbeat: 301 }, { ...context.signals!, lastBusinessPlayAt: new Date().toISOString(), lastPlayMinutesAgo: 0 }]) {
  const html = render(signals, { currentTrack: track });
  assert.match(html, /Тестовая точка/);
  assert.match(html, /Последний сигнал от плеера/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Воспроизведение не подтверждено/);
  assert.match(html, /Что звучит сейчас — появится, когда плеер точки начнёт присылать подтверждения/);
  assert.match(html, /Лицензия: нет подтверждённых данных/);
  assert.match(html, /href="\/player"/);
  assert.doesNotMatch(html, /Реальный трек|real-cover|Музыка играет|data-tone="error"|Лицензия активна/);
  for (const label of ["Атмосфера", "Следующая смена музыкального дня", "История звучания"]) {
    assert.ok(html.indexOf(label) > html.indexOf("Сейчас звучит"));
  }
  assert.equal((html.match(/<section[^>]*aria-disabled="true"/g) ?? []).length, 3);
  assert.equal((html.match(/<button[^>]*disabled=""[^>]*aria-disabled="true"/g) ?? []).length, 2);
  assert.match(html, /<input[^>]*disabled=""[^>]*aria-disabled="true"/);
  assert.ok(html.indexOf("Следующая смена") < html.indexOf("История звучания"));
}
assert.match(render(null), /Нет данных о плеере/);
assert.match(render(context.signals), /Плеер на связи/);
assert.match(render({ ...context.signals!, secondsSinceHeartbeat: 301 }), /Нет связи с плеером/);
assert.match(render({ ...context.signals!, lastPlayMinutesAgo: 2 }), /Последнее зарегистрированное событие воспроизведения: 2 мин назад/);
const nowMs = Date.parse("2026-10-14T12:00:00Z");
const confirmed = { nowMs, playbackState: "playing" as const, playbackConfirmedAt: new Date(nowMs).toISOString() };
assert.match(render(context.signals, { currentTrack: track, playbackConfirmation: confirmed }), /Реальный трек/);
assert.match(render(context.signals, { currentTrack: track, playbackConfirmation: confirmed }), /src="\/real-cover.webp"/);
for (const playbackConfirmation of [{ ...confirmed, playbackState: "paused" as const }, { ...confirmed, playbackConfirmedAt: new Date(nowMs - 301_000).toISOString() }, { ...confirmed, errorConfirmed: true }]) {
  assert.doesNotMatch(render(context.signals, { currentTrack: track, playbackConfirmation }), /Реальный трек|real-cover/);
}
assert.match(render(context.signals, { playbackConfirmation: { nowMs, errorConfirmed: true } }), /data-tone="error"/);
console.log("business-app-owner-home-render-unit: ok");
