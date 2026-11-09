"use client";

import { useBusinessChromeAccess, useHasLiveBusinessAccess } from "./BusinessAccessLine";
import { BusinessPayControls, useBusinessHomePay } from "./BusinessHomeAccessCard";
import { formatMoscowDateTime } from "@/lib/access-grants/policy";
import { BUSINESS_PLAN_MONTHLY_PRICE_RUB } from "@/lib/business/plan";
import { partnerQuoteIsDiscounted } from "@/lib/business/partner-codes";
import { BusinessStruckPrice } from "./BusinessPartnerPrice";
import { usePartnerQuote } from "./partner-quote-store";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { activateBusinessPoint, selectBusinessPoint } from "@/app/business-app/actions";
import { useBusinessDomain } from "./BusinessDomainProvider";
import { useBusinessCabinetMode } from "./BusinessPointMode";
import { emptyBusinessOwnerHomeSignals, type BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";
import { businessPilotSlots } from "@/lib/business-app/location-selection";
import {
  applyAccessToVenueDots,
  VENUE_STATUS_LEGEND,
  type VenueStatusDotRow,
} from "@/lib/business-app/venue-status-dot";
import { HALL_STALE_BUILD_NOTE } from "@/lib/business-app/hall-build-reload";

type LiveOwnerState = {
  locationId: string;
  signals: BusinessOwnerHomeSignals;
  venues: VenueStatusDotRow[];
};

function isVenueRow(value: unknown): value is VenueStatusDotRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.locationId !== "string") return false;
  if (!(row.color === "green" || row.color === "yellow" || row.color === "red" || row.color === "grey")) return false;
  if (typeof row.label !== "string") return false;
  if (row.staleBuild != null && typeof row.staleBuild !== "boolean") return false;
  return true;
}

export default function BusinessPointSlots() {
  const router = useRouter();
  const domain = useBusinessDomain();
  const access = useBusinessChromeAccess();
  const accessLive = useHasLiveBusinessAccess();
  const payment = useBusinessHomePay();
  const quote = usePartnerQuote(payment.canPay);
  const cabinet = useBusinessCabinetMode();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const locationId = domain.status === "authenticated" ? domain.location?.id : undefined;
  const enabled = domain.status === "authenticated" && domain.pilotSlots && cabinet.side !== "venue";
  const [live, setLive] = useState<LiveOwnerState | null>(null);
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
        if (!stopped) {
          if (response.ok && result.ok && result.locationId === locationId) {
            const venues = Array.isArray(result.venues) ? result.venues.filter(isVenueRow) : [];
            setLive({ locationId, signals: result.signals ?? emptyBusinessOwnerHomeSignals(), venues });
          } else {
            setLive({ locationId, signals: emptyBusinessOwnerHomeSignals(), venues: [] });
          }
        }
      } catch {
        if (!stopped) setLive({ locationId, signals: emptyBusinessOwnerHomeSignals(), venues: [] });
      } finally {
        window.clearTimeout(timeout);
        activeRequest = null;
        busy = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 15_000);
    const wake = () => void poll();
    document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; activeRequest?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); };
  }, [enabled, locationId]);
  const signals = live?.locationId === locationId ? live?.signals : domain.status === "authenticated" ? domain.signals : null;
  const venueDots = useMemo(() => {
    const rows = live && live.locationId === locationId ? live.venues : [];
    return applyAccessToVenueDots(rows, accessLive);
  }, [live, locationId, accessLive]);
  const statusById = useMemo(() => new Map(venueDots.map((row) => [row.locationId, row])), [venueDots]);
  const limit = domain.status === "authenticated" ? domain.venueSlotLimit ?? 1 : 1;
  // Same rule for every owner: one hall at start, «Добавить» up to the system limit.
  if (cabinet.side === "venue" || domain.status !== "authenticated" || limit < 2) return null;
  const halls = domain.locations ?? [];
  const slots = businessPilotSlots(halls, limit);
  const active = halls.filter((hall) => hall.status === "active").length;
  const multi = !!domain.pilotSlots;
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
      // The action sets the selected hall cookie and revalidates the layout, including cached forms.
      // Keep shell playback mounted; only location-local settings should reset for a different hall.
      router.push("/preferences");
    });
  }
  const addingTenth = limit >= 10 && halls.length === 9;
  const atCap = halls.length >= limit;
  const writeLink = (
    <Link className="business-app-btn business-app-btn-primary business-app-focus-ring mt-3 inline-flex" href="/profile#kontakty" data-testid="biz-more-points-write">Написать</Link>
  );
  return <section className="business-app-card mx-auto mb-4 max-w-3xl space-y-3" aria-label="Точки организации">
    <h2 className="text-lg font-bold">Мои точки</h2>
    <div className="flex flex-wrap gap-2">
      {slots.map((slot) => {
        const status = slot.location ? statusById.get(slot.location.id) : undefined;
        // Before the first owner-state poll, status is unknown – not "not paired" (grey).
        const dotKind = status?.color ?? (slot.location ? "pending" : null);
        const label = slot.location ? `Точка ${slot.number}: ${slot.location.name}` : `+ Добавить точку ${slot.number}`;
        const ariaLabel = status ? `${label} – ${status.label}` : label;
        return <button key={slot.number} type="button"
          className={slot.location
            ? "business-app-btn business-app-btn-secondary business-app-focus-ring business-venue-status-btn"
            : "business-app-btn business-app-btn-primary business-app-focus-ring"}
          aria-pressed={slot.location ? domain.location?.id === slot.location.id : undefined}
          aria-label={ariaLabel}
          data-testid={slot.location ? `biz-venue-status-${dotKind ?? "pending"}` : "biz-add-point"}
          disabled={pending || (!!slot.location && slot.location.status !== "active") || (!slot.location && !domain.canPay)}
          onClick={() => run(slot)}>
          {slot.location ? <>
            <span
              className={`business-venue-status-dot business-venue-status-dot--${dotKind}`}
              aria-hidden="true"
              data-color={dotKind ?? "pending"}
            />
            <span>{label}</span>
            <span className="sr-only">{status ? `Статус: ${status.label}` : "Статус пока неизвестен"}</span>
          </> : label}
        </button>;
      })}
    </div>
    {venueDots.some((row) => row.staleBuild) ? (
      <ul className="space-y-1" data-testid="biz-venue-stale-build-notes" aria-label="Устройства на старой версии">
        {slots.filter((slot) => slot.location && statusById.get(slot.location.id)?.staleBuild).map((slot) => (
          <li key={slot.number} className="text-sm text-[var(--biz-text-muted)]" data-testid={`biz-venue-stale-build-${slot.location!.id}`}>
            Точка {slot.number}: {HALL_STALE_BUILD_NOTE}
          </li>
        ))}
      </ul>
    ) : null}
    {halls.length > 0 ? (
      <ul className="business-venue-status-legend" aria-label="Обозначения статуса точек" data-testid="biz-venue-status-legend">
        {VENUE_STATUS_LEGEND.map((item) => (
          <li key={item.color}>
            <span className={`business-venue-status-dot business-venue-status-dot--${item.color}`} aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    ) : null}
    {addingTenth ? <div className="rounded-xl border border-[var(--biz-border)] p-3" data-testid="biz-tenth-point-notice">
      <p className="text-sm text-[var(--biz-text-muted)]">Сейчас вы подключаете десятую точку. В этой конфигурации точек десять. Одиннадцатую так же подключить нельзя – нужно чуть изменить конфигурацию. Если планируете подключать ещё, напишите заранее – подберём под вас отдельную структуру.</p>
      {writeLink}
    </div> : null}
    {atCap ? <div className="rounded-xl border border-[var(--biz-border)] p-3" data-testid="biz-more-points">
      <p className="text-sm text-[var(--biz-text-muted)]">{limit >= 10
        ? "Спасибо, что вы с нами и развиваете сеть. В этой конфигурации можно подключить десять точек; одиннадцатую так же добавить нельзя. Если планируете больше, напишите заранее – подберём более удобную схему именно под вашу ситуацию."
        : "Спасибо, что вы с нами и развиваете сеть. Для большей сети мы подберём более удобную схему именно под вашу ситуацию."}</p>
      {writeLink}
    </div> : null}
    {multi ? <>
    <p className="text-sm text-[var(--biz-text-muted)]">Активных точек: {active}. {partnerQuoteIsDiscounted(quote)
      ? <BusinessStruckPrice standardRub={quote.standardTotalRub} priceRub={quote.totalRub} testId="biz-points-price" />
      : `${active * BUSINESS_PLAN_MONTHLY_PRICE_RUB} ₽`} за 30 дней всего. Одна оплата за все активные точки.</p>
    {domain.pilotBilling?.paidUntil || access.endsAt ? <p className="text-sm">Следующее продление / конец доступа: {formatMoscowDateTime(new Date(domain.pilotBilling?.paidUntil ?? access.endsAt!))} (МСК).</p> : null}
    {domain.pilotBilling?.renewalBlocked ? <p role="status">Новая точка пока не оплачена. Она будет включена при следующем продлении; доплата в текущем периоде недоступна.</p> : null}
    <BusinessPayControls canPay={payment.canPay} accepted={payment.accepted} busy={payment.busy} error={payment.error}
      onAccept={payment.accept} onPay={payment.pay} receiptEmail={payment.askReceiptEmail ? { value: payment.receiptEmail, onChange: payment.setReceiptEmail } : null} />
    {domain.location ? <p className="text-sm" role="status">
      Выбрана: {domain.location.name}. Подключение: {signals?.liveConnected ? "на связи" : "нет свежего подтверждения"}.
      {signals?.liveConnected && signals.playbackState === "playing" && signals.playbackConfirmedSecondsAgo != null && signals.playbackConfirmedSecondsAgo <= 300
        ? ` Сейчас играет: ${signals.currentTrack?.title ?? "название недоступно"}.`
        : signals?.playbackState === "paused" ? " Музыка на паузе." : " Воспроизведение не подтверждено."}
    </p> : null}
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
