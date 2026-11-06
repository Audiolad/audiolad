"use client";

import { useEffect, useState, useTransition } from "react";
import { activateBusinessPoint, selectBusinessPoint } from "@/app/business-app/actions";
import { useBusinessDomain } from "./BusinessDomainProvider";
import { useBusinessCabinetMode } from "./BusinessPointMode";
import { emptyBusinessOwnerHomeSignals, type BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";
import { businessPilotSlots } from "@/lib/business-app/location-selection";
import { BUSINESS_PLAN_MONTHLY_PRICE_RUB, BUSINESS_PLAN_PERIOD_LABEL } from "@/lib/business/plan";

export default function BusinessPointSlots() {
  const domain = useBusinessDomain();
  const cabinet = useBusinessCabinetMode();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const locationId = domain.status === "authenticated" ? domain.location?.id : undefined;
  const enabled = domain.status === "authenticated" && domain.pilotSlots && cabinet.side !== "venue";
  const [live, setLive] = useState<{ locationId: string; signals: BusinessOwnerHomeSignals } | null>(null);
  useEffect(() => {
    if (!enabled || !locationId) return;
    let stopped = false;
    let busy = false;
    let activeRequest: AbortController | null = null;
    const poll = async () => {
      if (stopped || busy || document.visibilityState === "hidden") return;
      busy = true;
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch("/api/business/point", { method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ action: "owner-state", locationId }) });
        const result = await response.json();
        if (!stopped) setLive(response.ok && result.ok && result.locationId === locationId ? result : { locationId, signals: emptyBusinessOwnerHomeSignals() });
      } catch { if (!stopped) setLive({ locationId, signals: emptyBusinessOwnerHomeSignals() }); }
      finally { window.clearTimeout(timeout); activeRequest = null; busy = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 15_000);
    const wake = () => void poll();
    document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; activeRequest?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); };
  }, [enabled, locationId]);
  const signals = live?.locationId === locationId ? live?.signals : domain.status === "authenticated" ? domain.signals : null;
  if (cabinet.side === "venue" || domain.status !== "authenticated" || !domain.pilotSlots) return null;
  const slots = businessPilotSlots(domain.locations ?? []);
  const active = slots.filter((slot) => slot.location?.status === "active").length;
  function run(slot: typeof slots[number]) {
    setError("");
    start(async () => {
      try {
        const result = slot.location ? await selectBusinessPoint(slot.location.id) : await activateBusinessPoint(slot.number);
        if (!result.ok) { setError("Не удалось выбрать или активировать точку. Обновите страницу и повторите."); return; }
      } catch {
        setError("Не удалось выбрать или активировать точку. Обновите страницу и повторите.");
        return;
      }
      // A full navigation disposes preview audio, pending commands and all location-local forms.
      // This preference belongs to this owner browser only; paired devices keep their own sessions.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- dispose pending audio/commands and location-local forms
      window.location.assign("/preferences");
    });
  }
  return <section className="business-app-card mx-auto mb-4 max-w-3xl space-y-3" aria-label="Точки организации">
    <h2 className="text-lg font-bold">Мои точки</h2>
    <div className="flex flex-wrap gap-2">
      {slots.map((slot) => <button key={slot.number} type="button"
        className="business-app-btn business-app-btn-secondary business-app-focus-ring"
        aria-pressed={!!slot.location && domain.location?.id === slot.location.id}
        disabled={pending || (!!slot.location && slot.location.status !== "active") || (!slot.location && !domain.canPay)}
        onClick={() => run(slot)}>
        Точка {slot.number}{slot.location ? `: ${slot.location.name}` : slot.number === 3 ? " – резерв для кофейни · Активировать" : " – Активировать"}
      </button>)}
    </div>
    <p className="text-sm text-[var(--biz-text-muted)]">Активных точек: {active}. После перехода на оплату: {BUSINESS_PLAN_MONTHLY_PRICE_RUB} ₽ за точку, {active * BUSINESS_PLAN_MONTHLY_PRICE_RUB} ₽ {BUSINESS_PLAN_PERIOD_LABEL} всего. Оплата пилота согласуется отдельно.</p>
    {domain.location ? <p className="text-sm" role="status">
      Выбрана: {domain.location.name}. Подключение: {signals?.liveConnected ? "на связи" : "нет свежего подтверждения"}.
      {signals?.liveConnected && signals.playbackState === "playing" && signals.playbackConfirmedSecondsAgo != null && signals.playbackConfirmedSecondsAgo <= 300
        ? ` Сейчас играет: ${signals.currentTrack?.title ?? "название недоступно"}.`
        : signals?.playbackState === "paused" ? " Музыка на паузе." : " Воспроизведение не подтверждено."}
    </p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
