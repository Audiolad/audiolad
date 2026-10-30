"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import PointPairingCard from "@/components/business-app/PointPairingCard";
import VenueConfirmDialog from "@/components/business-app/VenueConfirmDialog";
import VenueLicenceStickerCard from "@/components/business-app/venue-licence/VenueLicenceStickerCard";
import type { PointCommandType } from "@/lib/business-app/point-commands";

/** Settings page with the atmosphere picker opened under «Изменить звучание». */
const VENUE_SOUND_HREF = "/preferences?sound=open";

const QUESTIONS: Record<PointCommandType, string> = {
  pause: "Поставить музыку в зале на паузу?",
  resume: "Продолжить музыку в зале?",
  next_track: "Включить следующий трек в зале?",
};

export default function VenueControlPanel({
  locationId,
  locationName,
  pointCanEdit,
  soundSlot = null,
  soundInitiallyOpen = false,
  licenceSticker = null,
}: {
  locationId: string;
  locationName: string;
  pointCanEdit: boolean;
  /** Atmosphere picker. It opens right under «Изменить звучание». Without it the button links to the settings page. */
  soundSlot?: ReactNode;
  soundInitiallyOpen?: boolean;
  /** The venue's own QR sticker. Null while the licence flag is off. */
  licenceSticker?: { publicId: string } | null;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(pointCanEdit);
  const [name, setName] = useState(locationName);
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

  const saveName = () => {
    const next = name.trim();
    if (!next) return;
    ask("Сохранить новое название кофейни?", () => {
      setPending(true);
      setError(null);
      void fetch("/api/business/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "rename", locationId, name: next }),
      })
        .then((res) => res.json())
        .then((json: { ok?: boolean; error?: string }) => {
          if (json.ok === true) router.refresh();
          else setError(json.error ?? "Не удалось сохранить название. Попробуйте ещё раз.");
        })
        .catch(() => setError("Не удалось сохранить название. Попробуйте ещё раз."))
        .finally(() => setPending(false));
    });
  };

  return (
    <section className="business-app-card space-y-4" data-testid="biz-venue-control" aria-labelledby="venue-control-title">
      <h2 id="venue-control-title" className="text-[1.15rem] font-bold text-[var(--biz-text)]">
        Управление кофейней
      </h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Пауза, продолжение, следующий трек и отправка атмосферы спрашивают подтверждение и уходят в кофейню. Слушать у себя это не включает.
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
      <label className="flex items-start gap-3 text-sm leading-6 text-[var(--biz-text)]">
        <input
          type="checkbox"
          className="mt-1"
          checked={allowed}
          disabled={pending || confirm !== null}
          data-testid="biz-point-can-edit"
          onChange={(event) => saveFlag(event.target.checked)}
        />
        <span>Разрешить менять музыку с устройства в заведении</span>
      </label>
      <label className="block text-sm text-[var(--biz-text)]">
        <span className="font-medium">Название кофейни</span>
        <input
          className="mt-2 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-3"
          value={name}
          maxLength={120}
          data-testid="biz-venue-name"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" disabled={pending || confirm !== null || name.trim().length === 0} onClick={saveName} data-testid="biz-venue-rename">
        Сохранить название
      </button>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        В зале новое звучание начнётся со следующего трека. Перед отправкой кабинет спросит подтверждение.
      </p>
      {soundSlot ? (
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          aria-expanded={soundOpen}
          aria-controls="venue-sound-panel"
          data-testid="biz-venue-atmosphere-toggle"
          onClick={toggleSound}
        >
          Изменить звучание
        </button>
      ) : (
        <a href={VENUE_SOUND_HREF} className="business-app-btn business-app-btn-secondary business-app-focus-ring" data-testid="biz-venue-atmosphere-link">
          Изменить звучание
        </a>
      )}
      {soundSlot && soundOpen ? (
        <div id="venue-sound-panel" ref={soundRef} className="business-venue-sound space-y-4" data-testid="biz-venue-sound-panel">
          {soundSlot}
        </div>
      ) : null}
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
      {licenceSticker ? (
        <VenueLicenceStickerCard locationId={locationId} publicId={licenceSticker.publicId} placement="venue" />
      ) : null}
      <PointPairingCard locationId={locationId} />
    </section>
  );
}
