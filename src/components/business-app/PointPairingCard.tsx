"use client";

import { useEffect, useRef, useState } from "react";

import PointQrCode from "@/components/business-app/PointQrCode";
import VenueConfirmDialog from "@/components/business-app/VenueConfirmDialog";
import { formatPointCode } from "@/lib/business-app/point-session";
import {
  pointCodeDeadline,
  pointDeviceLink,
  pointShareText,
  pointShareTitle,
} from "@/lib/business-app/point-share";

type LinkState = { linked: boolean; playerCode: string | null };
type Issued = { code: string; deadlineMs: number };

/** Anchor of this card. The owner home links here with «Подключить устройство в зале». */
export const POINT_PAIRING_ANCHOR_ID = "device";

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PointPairingCard({ locationId }: { locationId: string }) {
  const [link, setLink] = useState<LinkState | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"create" | "revoke" | null>(null);
  const [showQr, setShowQr] = useState(false);
  const actionGuard = useRef(false);
  const [copied, setCopied] = useState(false);
  const [copyByHand, setCopyByHand] = useState(false);
  const linkField = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    if (!issued) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [issued]);

  const secondsLeft = issued ? Math.max(0, Math.floor((issued.deadlineMs - now) / 1000)) : 0;
  const live = issued && secondsLeft > 0 ? issued : null;
  const deviceUrl = typeof window === "undefined"
    ? ""
    : pointDeviceLink(window.location.origin, window.location.hostname, live?.code ?? null);

  const createCode = async (): Promise<Issued | null> => {
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/business/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "create", locationId }),
      });
      const json: { ok?: boolean; code?: string; expiresAt?: string; expiresIn?: number; error?: string } = await res.json();
      if (json.ok !== true || !json.code) {
        setError(json.error ?? "Не удалось создать код. Попробуйте ещё раз.");
        return null;
      }
      const receivedAt = Date.now();
      const next = { code: json.code, deadlineMs: pointCodeDeadline(json.expiresIn, json.expiresAt, receivedAt) };
      setNow(receivedAt);
      setIssued(next);
      return next;
    } catch {
      setError("Не удалось создать код. Попробуйте ещё раз.");
      return null;
    }
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
          setIssued(null);
        } else setError(json.error ?? "Не удалось отключить устройство. Попробуйте ещё раз.");
      })
      .catch(() => setError("Не удалось отключить устройство. Попробуйте ещё раз."))
      .finally(() => setPending(false));
  };

  // First use issues the code as part of the chosen action, without a separate confirmation.
  const withCode = async (run: (url: string, text: string) => void | Promise<void>) => {
    if (actionGuard.current) return;
    actionGuard.current = true;
    setPending(true);
    setError(null);
    try {
      const current = issued && issued.deadlineMs > Date.now() ? issued : await createCode();
      if (!current) return;
      await run(pointDeviceLink(window.location.origin, window.location.hostname, current.code), pointShareText(current.code));
    } finally {
      actionGuard.current = false;
      setPending(false);
    }
  };

  const replaceCode = async () => {
    if (actionGuard.current) return;
    actionGuard.current = true;
    setPending(true);
    try { await createCode(); }
    finally {
      actionGuard.current = false;
      setPending(false);
    }
  };

  // Manual copying also covers browsers that lose clipboard permission after issuing a code.
  const copyByHandNow = () => {
    setCopyByHand(true);
    window.setTimeout(() => {
      linkField.current?.focus();
      linkField.current?.select();
    }, 0);
  };

  const share = () => withCode(async (url, text) => {
    if (typeof navigator.share !== "function") {
      copyByHandNow();
      return;
    }
    // Native phone share sheet includes installed apps such as MAX and Telegram.
    try {
      await navigator.share({ title: pointShareTitle(window.location.hostname), text, url });
    } catch (err) {
      if ((err as { name?: string } | null)?.name !== "AbortError") {
        setError("Ссылка готова. Нажмите «Поделиться ссылкой» ещё раз или скопируйте её.");
        copyByHandNow();
      }
    }
  });

  const copy = () => withCode(async (url) => {
    setCopyByHand(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      copyByHandNow();
    }
  });

  return (
    <section
      id={POINT_PAIRING_ANCHOR_ID}
      className="business-app-card scroll-mt-24 space-y-3"
      data-testid="biz-point-pairing"
    >
      {confirm ? (
        <VenueConfirmDialog
          text={confirm === "revoke" ? "Отключить устройство в зале?" : "Создать новый код подключения устройства?"}
          onYes={() => {
            if (yesGuard.current) return;
            yesGuard.current = true;
            const action = confirm;
            setConfirm(null);
            if (action === "revoke") revoke();
            else void replaceCode();
          }}
          onNo={() => setConfirm(null)}
        />
      ) : null}
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Устройство в зале</h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Код из 4 цифр действует 20 минут. Отправьте ссылку на устройство у колонки в кофейне – оно подключится само.
        Или откройте на нём страницу подключения и введите код. Музыку в зале сообщает только это устройство.
      </p>
      {link?.linked ? (
        <p data-testid="biz-point-linked">Устройство подключено{link.playerCode ? ` · ${link.playerCode}` : ""}.</p>
      ) : (
        <p data-testid="biz-point-unlinked">Устройство в зале ещё не подключено.</p>
      )}
      {live ? (
        <div className="space-y-1">
          <p
            className="font-mono text-[2.5rem] font-bold leading-none tracking-[0.15em] text-[var(--biz-text)]"
            data-testid="biz-point-code"
            aria-label={`Код ${formatPointCode(live.code)}`}
          >
            {formatPointCode(live.code)}
          </p>
          <p className="text-sm text-[var(--biz-text-muted)]" data-testid="biz-point-code-timer">
            Действует ещё {clock(secondsLeft)}
          </p>
        </div>
      ) : issued ? (
        <p className="text-sm text-[var(--biz-text-muted)]" data-testid="biz-point-code-expired">
          Код истёк. Получите новый.
        </p>
      ) : null}
      {error ? (
        <p className="business-app-alert" data-tone="warn" role="alert">{error}</p>
      ) : null}
      <div className="flex flex-col items-start gap-2">
        <button type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring"
          onClick={() => void share()} disabled={pending || confirm !== null} data-testid="biz-point-share">
          Поделиться ссылкой
        </button>
        <p className="w-full text-sm text-[var(--biz-text-muted)]" data-testid="biz-point-share-hint">
          Нажмите «Поделиться ссылкой» и выберите, куда отправить.
        </p>
        <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          onClick={() => void copy()} disabled={pending || confirm !== null} data-testid="biz-point-copy">
          {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        </button>
        <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          onClick={() => void withCode(() => setShowQr(true))} disabled={pending || confirm !== null}
          aria-expanded={Boolean(showQr && live)} aria-controls="point-qr-panel" data-testid="biz-point-show-qr">
          Поделиться через QR-код
        </button>
        {live ? (
          <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring"
            onClick={() => ask("create")} disabled={pending || confirm !== null} data-testid="biz-point-create">
            Новый код
          </button>
        ) : null}
        {link?.linked ? (
          <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring"
            onClick={() => ask("revoke")} disabled={pending || confirm !== null} data-testid="biz-point-revoke">
            Отключить устройство
          </button>
        ) : null}
      </div>
      {live ? (
        <div className="space-y-3" data-testid="biz-point-share-fallback">
          {copyByHand ? (
            <>
              <p className="text-sm text-[var(--biz-text-muted)]" role="status" data-testid="biz-point-copy-hand">
                Ссылка выделена в поле ниже – скопируйте её вручную.
              </p>
              <input ref={linkField} readOnly className="business-app-input w-full text-sm" value={deviceUrl}
                aria-label="Ссылка на страницу подключения" onFocus={(event) => event.currentTarget.select()} data-testid="biz-point-link" />
            </>
          ) : null}
          {showQr ? (
            <div id="point-qr-panel" className="space-y-2">
              <PointQrCode value={deviceUrl} size={240} label="QR-код со ссылкой на страницу подключения" />
              <p className="text-sm text-[var(--biz-text-muted)]">
                Отсканируйте этот QR-код другим телефоном в зале – откроется страница подключения устройства.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
