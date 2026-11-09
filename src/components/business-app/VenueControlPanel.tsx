"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import PointPairingCard from "@/components/business-app/PointPairingCard";
import VenueConfirmDialog from "@/components/business-app/VenueConfirmDialog";
import { ATMOSPHERE_REBUILD_HINT, ATMOSPHERE_REBUILD_LABEL } from "@/lib/business-app/atmosphere-rebuild";
import type { PointCommandType } from "@/lib/business-app/point-commands";

/** Settings page with the atmosphere builder opened under «Пересобрать атмосферу». */
const VENUE_SOUND_HREF = "/preferences?sound=open";

const QUESTIONS: Record<PointCommandType, string> = {
  pause: "Поставить музыку в зале на паузу?",
  resume: "Продолжить музыку в зале?",
  next_track: "Включить следующий трек в зале?",
};

export const POINT_SWITCH_LABEL = "Разрешить менять музыку с устройства в заведении";
export const POINT_SWITCH_ON_HINT = "Сотрудники в зале могут переключать треки и нажимать «Больше такой музыки» и «Меньше такой музыки».";
export const POINT_SWITCH_OFF_HINT = "Музыку в зале меняете только вы из кабинета. Чтобы сотрудники снова могли ей управлять, нажмите «Включить изменения».";

export default function VenueControlPanel({
  locationId,
  pointCanEdit,
  soundSlot = null,
  soundInitiallyOpen = false,
  atmosphereSummary = null,
}: {
  locationId: string;
  pointCanEdit: boolean;
  /**
   * The 4 × 4 atmosphere builder (BusinessPlayerSettings). It opens right under «Пересобрать
   * атмосферу». Without it the button links to the settings page.
   */
  soundSlot?: ReactNode;
  soundInitiallyOpen?: boolean;
  /** «Уютная, Джаз» – what the venue plays now, when a saved atmosphere is known. */
  atmosphereSummary?: string | null;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(pointCanEdit);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);
  const yesGuard = useRef(false);
  const [soundOpen, setSoundOpen] = useState(soundInitiallyOpen);
  const soundRef = useRef<HTMLDivElement>(null);
  const scrollSound = useRef(soundInitiallyOpen);

  useEffect(() => {
    if (!soundOpen || !scrollSound.current) return;
    scrollSound.current = false;
    const node = soundRef.current;
    if (!node) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [soundOpen]);

  const toggleSound = () => {
    scrollSound.current = !soundOpen;
    setSoundOpen((open) => !open);
  };

  const ask = (text: string, run: () => void) => {
    if (pending || confirm) return;
    yesGuard.current = false;
    setConfirm({ text, run });
  };

  const send = (type: PointCommandType) => {
    const commandId = crypto.randomUUID();
    ask(QUESTIONS[type], () => {
      setPending(true);
      setError(null);
      void fetch("/api/business/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "enqueue", id: commandId, locationId, type }),
      })
        .then((res) => res.json())
        .then((json: { ok?: boolean; error?: string }) => {
          if (json.ok !== true) setError(json.error ?? "Не удалось отправить команду. Попробуйте ещё раз.");
        })
        .catch(() => setError("Не удалось отправить команду. Попробуйте ещё раз."))
        .finally(() => setPending(false));
    });
  };

  const saveFlag = (next: boolean) => {
    const run = () => {
      setPending(true);
      setError(null);
      void fetch("/api/business/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "permission", locationId, allowed: next }),
      })
        .then((res) => res.json())
        .then((json: { ok?: boolean; error?: string }) => {
          if (json.ok === true) {
            setAllowed(next);
            router.refresh();
          } else setError(json.error ?? "Не удалось сохранить разрешение. Попробуйте ещё раз.");
        })
        .catch(() => setError("Не удалось сохранить разрешение. Попробуйте ещё раз."))
        .finally(() => setPending(false));
    };
    ask(next ? "Разрешить устройству в зале менять музыку?" : "Запретить устройству в зале менять музыку?", run);
  };

  return (
    <>
      <PointPairingCard locationId={locationId} />
    <section className="business-app-card space-y-4" data-testid="biz-venue-control" aria-labelledby="venue-control-title">
      <h2 id="venue-control-title" className="text-[1.15rem] font-bold text-[var(--biz-text)]">
        Музыка в зале
      </h2>
      <div className="business-atmosphere-rebuild space-y-3" data-testid="biz-atmosphere-rebuild">
        <h3 className="text-base font-semibold text-[var(--biz-text)]">Атмосфера</h3>
        {atmosphereSummary ? (
          <p className="text-sm leading-6 text-[var(--biz-text)]" data-testid="biz-atmosphere-current">
            Сейчас: {atmosphereSummary}.
          </p>
        ) : null}
        <p className="text-sm leading-6 text-[var(--biz-text-muted)]">{ATMOSPHERE_REBUILD_HINT}</p>
        {soundSlot ? (
          <button
            type="button"
            className="business-app-btn business-app-btn-cta business-app-focus-ring business-atmosphere-rebuild__cta"
            aria-expanded={soundOpen}
            aria-controls="venue-sound-panel"
            data-testid="biz-venue-atmosphere-toggle"
            onClick={toggleSound}
          >
            {ATMOSPHERE_REBUILD_LABEL}
          </button>
        ) : (
          <a
            href={VENUE_SOUND_HREF}
            className="business-app-btn business-app-btn-cta business-app-focus-ring business-atmosphere-rebuild__cta"
            data-testid="biz-venue-atmosphere-link"
          >
            {ATMOSPHERE_REBUILD_LABEL}
          </a>
        )}
        {soundSlot && soundOpen ? (
          <div id="venue-sound-panel" ref={soundRef} className="business-venue-sound space-y-4" data-testid="biz-venue-sound-panel">
            {soundSlot}
          </div>
        ) : null}
      </div>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Пауза, продолжение, следующий трек и новое звучание уходят в зал после подтверждения. Вкладка «Музыка» играет только у вас.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" disabled={pending || confirm !== null} data-testid="biz-venue-pause" onClick={() => send("pause")}>
          Пауза в зале
        </button>
        <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" disabled={pending || confirm !== null} data-testid="biz-venue-resume" onClick={() => send("resume")}>
          Продолжить в зале
        </button>
        <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" disabled={pending || confirm !== null} data-testid="biz-venue-next" onClick={() => send("next_track")}>
          Следующий трек в зале
        </button>
      </div>
      {/* MAX Potok-style switch (Sergey 09.11.2026): both states stay visible; a tap only asks. */}
      <div className="business-point-switch" data-testid="biz-point-switch" data-allowed={allowed ? "true" : "false"}>
        <div className="business-point-switch__row">
          <span id="biz-point-can-edit-label" className="business-point-switch__label">
            {POINT_SWITCH_LABEL}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={allowed}
            aria-labelledby="biz-point-can-edit-label"
            className="business-point-switch__toggle business-app-focus-ring"
            data-on={allowed ? "true" : "false"}
            disabled={pending || confirm !== null}
            data-testid="biz-point-can-edit"
            onClick={() => saveFlag(!allowed)}
          >
            <span className="business-point-switch__knob" aria-hidden="true" />
            <span className="business-point-switch__state">{allowed ? "Включено" : "Выключено"}</span>
          </button>
        </div>
        <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-point-switch-hint">
          {allowed ? POINT_SWITCH_ON_HINT : POINT_SWITCH_OFF_HINT}
        </p>
        {allowed ? null : (
          <button
            type="button"
            className="business-app-btn business-app-btn-secondary business-app-focus-ring"
            disabled={pending || confirm !== null}
            data-testid="biz-point-enable"
            onClick={() => saveFlag(true)}
          >
            Включить изменения
          </button>
        )}
      </div>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        В зале новое звучание начнётся со следующего трека.
      </p>
      {error ? <p className="business-app-alert" data-tone="warn" role="alert">{error}</p> : null}
      {confirm ? (
        <VenueConfirmDialog
          text={confirm.text}
          onYes={() => {
            if (yesGuard.current) return;
            yesGuard.current = true;
            const run = confirm.run;
            setConfirm(null);
            run();
          }}
          onNo={() => setConfirm(null)}
        />
      ) : null}
    </section>
    </>
  );
}
