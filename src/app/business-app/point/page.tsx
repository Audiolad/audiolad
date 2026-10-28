"use client";

import { useEffect, useState } from "react";

import { normalizePointCode } from "@/lib/business-app/point-session";

export default function BusinessPointJoinPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const join = (raw: string) => {
    const next = normalizePointCode(raw);
    if (!next) {
      setError("Код не подошёл. Запросите новый.");
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
        if (json.ok === true) {
          setName(json.locationName || "Кофейня");
          window.history.replaceState(null, "", window.location.pathname);
        } else setError(json.error ?? "Код не подошёл. Запросите новый.");
      })
      .catch(() => setError("Код не подошёл. Запросите новый."))
      .finally(() => setPending(false));
  };

  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    // The code stays in the address hash until this page sends it once.
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
      </section>
    );
  }

  return (
    <form
      className="business-app-card mx-auto max-w-xl space-y-3"
      data-testid="biz-point-join"
      onSubmit={(event) => {
        event.preventDefault();
        join(code);
      }}
    >
      <h1 className="text-[1.75rem] font-bold text-[var(--biz-text)]">Подключить устройство</h1>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Введите код с телефона. После этого музыку в зале сообщает это устройство.
      </p>
      <label className="block text-sm font-medium text-[var(--biz-text)]">
        Код
        <input
          className="business-app-input mt-1 w-full tracking-[0.2em]"
          value={code}
          autoComplete="off"
          inputMode="text"
          maxLength={10}
          data-testid="biz-point-code-input"
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      {error ? <p className="business-app-alert" data-tone="warn" role="alert">{error}</p> : null}
      <button
        type="submit"
        className="business-app-btn business-app-btn-primary business-app-focus-ring"
        disabled={pending}
      >
        Подключить
      </button>
    </form>
  );
}
