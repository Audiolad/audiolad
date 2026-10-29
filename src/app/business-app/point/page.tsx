"use client";

import { useEffect, useState } from "react";

import { BUSINESS_POINT_CODE_LENGTH, normalizePointCode, pointCodeInput } from "@/lib/business-app/point-session";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice?: Promise<unknown> };

const WRONG = "Код не подошёл. Проверьте цифры или получите новый код в кабинете.";

/** Home-screen hint. Uses the business PWA manifest; the install button shows only where the browser offers it. */
function AddToHomeHint() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (installed) return null;
  return (
    <div className="space-y-2 rounded-xl border border-[var(--biz-border,rgba(0,0,0,0.1))] p-3" data-testid="biz-point-home-hint">
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Добавьте на экран «Домой», чтобы открывать в одно касание. На айфоне и айпаде: «Поделиться», затем «На экран „Домой“».
        На компьютере – добавьте страницу в закладки.
      </p>
      {prompt ? (
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          data-testid="biz-point-install"
          onClick={() => {
            void prompt.prompt().finally(() => setPrompt(null));
          }}
        >
          Добавить на экран «Домой»
        </button>
      ) : null}
    </div>
  );
}

export default function BusinessPointJoinPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const join = (raw: string) => {
    const next = normalizePointCode(raw);
    if (!next) {
      setError("Введите 4 цифры кода.");
      return;
    }
    setPending(true);
    setError(null);
    void fetch("/api/business/point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "join", code: next }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; locationName?: string; error?: string }) => {
        if (json.ok === true) setName(json.locationName || "Кофейня");
        else {
          setError(json.error ?? WRONG);
          setCode("");
        }
      })
      .catch(() => setError(WRONG))
      .finally(() => setPending(false));
  };

  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    if (!fromHash) return;
    // The code lives only in the fragment, which browsers never send to the server.
    // Drop it from the address bar at once so it is not kept in history or bookmarks.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (normalizePointCode(fromHash)) join(fromHash);
  }, []);

  if (name) {
    return (
      <section className="business-app-card mx-auto max-w-xl space-y-3" data-testid="biz-point-ready">
        <h1 className="text-[1.75rem] font-bold text-[var(--biz-text)]">{name}</h1>
        <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
          Это устройство подключено. Что играет в зале, видно на телефоне того, кто настраивает музыку.
        </p>
        <AddToHomeHint />
      </section>
    );
  }

  return (
    <form
      className="business-app-card mx-auto max-w-xl space-y-4"
      data-testid="biz-point-join"
      onSubmit={(event) => {
        event.preventDefault();
        join(code);
      }}
    >
      <h1 className="text-[1.75rem] font-bold text-[var(--biz-text)]">Подключить устройство</h1>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Введите 4 цифры из кабинета на телефоне («Устройство в зале», кнопка «Получить код для устройства»).
        Код действует 20 минут. После этого музыку в кофейне сообщает это устройство.
      </p>
      <label className="block text-sm font-medium text-[var(--biz-text)]" htmlFor="biz-point-code">
        Код из 4 цифр
      </label>
      <input
        id="biz-point-code"
        name="code"
        className="business-app-input w-full max-w-[16rem] text-center font-mono text-[2.5rem] font-bold leading-tight tracking-[0.5em]"
        value={code}
        type="text"
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={BUSINESS_POINT_CODE_LENGTH}
        placeholder="0000"
        aria-describedby={error ? "biz-point-code-error" : undefined}
        aria-invalid={error ? true : undefined}
        disabled={pending}
        data-testid="biz-point-code-input"
        onChange={(event) => {
          const next = pointCodeInput(event.target.value);
          setCode(next);
          if (error) setError(null);
          if (next.length === BUSINESS_POINT_CODE_LENGTH) join(next);
        }}
      />
      {error ? (
        <p id="biz-point-code-error" className="business-app-alert" data-tone="warn" role="alert">{error}</p>
      ) : null}
      <button
        type="submit"
        className="business-app-btn business-app-btn-primary business-app-focus-ring"
        disabled={pending || code.length !== BUSINESS_POINT_CODE_LENGTH}
      >
        {pending ? "Подключаем…" : "Подключить"}
      </button>
      <AddToHomeHint />
    </form>
  );
}
