"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import PointPairingCard from "@/components/business-app/PointPairingCard";
import VenueConfirmDialog from "@/components/business-app/VenueConfirmDialog";
import type { PointCommandType } from "@/lib/business-app/point-commands";

const QUESTIONS: Record<PointCommandType, string> = {
  pause: "Поставить музыку в зале на паузу?",
  resume: "Продолжить музыку в зале?",
  next_track: "Включить следующий трек в зале?",
};

export default function VenueControlPanel({
  locationId,
  locationName,
  pointCanEdit,
}: {
  locationId: string;
  locationName: string;
  pointCanEdit: boolean;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(pointCanEdit);
  const [name, setName] = useState(locationName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);
  const yesGuard = useRef(false);

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
    ask("Сохранить новое название точки?", () => {
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
        Управление точкой
      </h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Каждое действие спрашивает подтверждение и уходит в зал. Слушать у себя это не включает.
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
        <span className="font-medium">Название точки</span>
        <input
          className="mt-2 w-full rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-3"
          value={name}
          maxLength={120}
          data-testid="biz-venue-name"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <a href="/preferences" className="business-app-btn business-app-btn-secondary business-app-focus-ring" data-testid="biz-venue-atmosphere-link">
        Изменить звучание
      </a>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        В зале новое звучание начнётся со следующего трека. Перед записью кабинет спросит подтверждение.
      </p>
      <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" disabled={pending || confirm !== null || name.trim().length === 0} onClick={saveName} data-testid="biz-venue-rename">
        Сохранить название
      </button>
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
      <PointPairingCard locationId={locationId} />
    </section>
  );
}
