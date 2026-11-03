"use client";

import { useState } from "react";

import ProfileHelpContact from "@/components/business-app/ProfileHelpContact";
import { useBusinessCabinetMode } from "@/components/business-app/BusinessPointMode";

/**
 * «Помощь» on the venue side (cabinet-mode.ts): Sergey's contacts and «Отключить это устройство».
 * The button closes only this browser's own device session; other devices of the venue keep playing.
 * In the owner's preview it stays visible but off: the phone is not a device in the hall.
 */
export default function BusinessHallHelp() {
  const cabinet = useBusinessCabinetMode();
  const [state, setState] = useState<"idle" | "confirm" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const live = cabinet.mode === "point" && cabinet.can("disconnectThisDevice");

  async function disconnect() {
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/business/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect-self" }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || body?.ok !== true) {
        setError(body?.error ?? "Не удалось отключить устройство. Попробуйте ещё раз.");
        setState("idle");
        return;
      }
      // Full load on purpose: the device session is gone, the hall player must stop with it.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a soft navigation would keep the player playing
      window.location.assign("/point");
    } catch {
      setError("Не удалось отключить устройство. Проверьте интернет и попробуйте ещё раз.");
      setState("idle");
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6" data-testid="biz-hall-help">
      <section className="business-app-card">
        <h1 className="text-[1.45rem] font-bold tracking-tight text-[var(--biz-text)]">Помощь</h1>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">
          Музыка не играет или пришла проверка? Напишите или позвоните – поможем.
        </p>
        <div className="mt-4">
          <ProfileHelpContact />
        </div>
      </section>
      <section className="business-app-card" data-testid="biz-hall-disconnect">
        <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Устройство в зале</h2>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">
          Отключает только это устройство: музыка на нём остановится, другие устройства кофейни продолжат играть.
          Снова подключить можно кодом из кабинета владельца.
        </p>
        {!live ? (
          <p className="mt-2 text-sm text-[var(--biz-text-muted)]" data-testid="biz-hall-disconnect-preview">
            Кнопка работает только на устройстве в зале.
          </p>
        ) : null}
        {state === "confirm" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="business-app-btn business-app-btn-secondary business-app-focus-ring"
              onClick={() => void disconnect()}
              data-testid="biz-hall-disconnect-yes"
            >
              Да, отключить
            </button>
            <button
              type="button"
              className="business-app-btn business-app-btn-primary business-app-focus-ring"
              onClick={() => setState("idle")}
            >
              Оставить
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="mt-3 business-app-btn business-app-btn-secondary business-app-focus-ring"
            disabled={!live || state === "sending"}
            onClick={() => setState("confirm")}
            data-testid="biz-hall-disconnect-button"
          >
            {state === "sending" ? "Отключаем…" : "Отключить это устройство"}
          </button>
        )}
        {error ? (
          <p className="mt-2 text-sm text-[var(--biz-danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
