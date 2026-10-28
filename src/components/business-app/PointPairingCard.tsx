"use client";

import { useEffect, useRef, useState } from "react";

import VenueConfirmDialog from "@/components/business-app/VenueConfirmDialog";

type LinkState = { linked: boolean; playerCode: string | null };

export default function PointPairingCard({ locationId }: { locationId: string }) {
  const [link, setLink] = useState<LinkState | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"create" | "revoke" | null>(null);
  const yesGuard = useRef(false);
  const ask = (action: "create" | "revoke") => {
    yesGuard.current = false;
    setConfirm(action);
  };

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/business/point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "link", locationId }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; linked?: boolean; playerCode?: string | null }) => {
        if (cancelled || json.ok !== true) return;
        setLink({ linked: json.linked === true, playerCode: json.playerCode ?? null });
      })
      .catch(() => {
        /* the card still offers a new code */
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const createCode = () => {
    setPending(true);
    setError(null);
    void fetch("/api/business/point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "create", locationId }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; code?: string; error?: string }) => {
        if (json.ok === true && json.code) setCode(json.code);
        else setError(json.error ?? "Не удалось создать код. Попробуйте ещё раз.");
      })
      .catch(() => setError("Не удалось создать код. Попробуйте ещё раз."))
      .finally(() => setPending(false));
  };

  const revoke = () => {
    setPending(true);
    setError(null);
    void fetch("/api/business/point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "revoke", locationId }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; error?: string }) => {
        if (json.ok === true) {
          setLink({ linked: false, playerCode: null });
          setCode(null);
        } else setError(json.error ?? "Не удалось отключить устройство. Попробуйте ещё раз.");
      })
      .catch(() => setError("Не удалось отключить устройство. Попробуйте ещё раз."))
      .finally(() => setPending(false));
  };

  return (
    <section className="business-app-card space-y-3" data-testid="biz-point-pairing">
      {confirm ? (
        <VenueConfirmDialog
          text={confirm === "revoke" ? "Отключить устройство в зале?" : "Создать новый код подключения устройства?"}
          onYes={() => {
            if (yesGuard.current) return;
            yesGuard.current = true;
            const action = confirm;
            setConfirm(null);
            if (action === "revoke") revoke();
            else createCode();
          }}
          onNo={() => setConfirm(null)}
        />
      ) : null}
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Устройство в зале</h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Код действует 10 минут. Введите его на устройстве у колонки, на странице подключения.
        Музыку в зале сообщает только это устройство.
      </p>
      {link?.linked ? (
        <p data-testid="biz-point-linked">Устройство подключено{link.playerCode ? ` · ${link.playerCode}` : ""}.</p>
      ) : (
        <p data-testid="biz-point-unlinked">Устройство в зале ещё не подключено.</p>
      )}
      {code ? (
        <p className="text-2xl font-bold tracking-[0.2em] text-[var(--biz-text)]" data-testid="biz-point-code">
          {code}
        </p>
      ) : null}
      {error ? (
        <p className="business-app-alert" data-tone="warn" role="alert">{error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="business-app-btn business-app-btn-primary business-app-focus-ring"
          onClick={() => ask("create")}
          disabled={pending || confirm !== null}
          data-testid="biz-point-create"
        >
          Получить код для устройства
        </button>
        {link?.linked ? (
          <button
            type="button"
            className="business-app-btn business-app-btn-secondary business-app-focus-ring"
            onClick={() => ask("revoke")}
            disabled={pending || confirm !== null}
            data-testid="biz-point-revoke"
          >
            Отключить устройство
          </button>
        ) : null}
      </div>
    </section>
  );
}
