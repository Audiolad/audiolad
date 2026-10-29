"use client";

import { useEffect, useRef, useState } from "react";

import PointQrCode from "@/components/business-app/PointQrCode";
import VenueConfirmDialog from "@/components/business-app/VenueConfirmDialog";
import { formatPointCode } from "@/lib/business-app/point-session";
import {
  POINT_SHARE_TITLE,
  pointCodeSecondsLeft,
  pointDeviceLink,
  pointMailtoUrl,
  pointShareText,
  pointTelegramShareUrl,
} from "@/lib/business-app/point-share";

type LinkState = { linked: boolean; playerCode: string | null };
type Issued = { code: string; expiresAt: string | null };

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
  const [more, setMore] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const secondsLeft = issued ? pointCodeSecondsLeft(issued.expiresAt, now) : 0;
  const live = issued && secondsLeft > 0 ? issued : null;
  const deviceUrl = typeof window === "undefined"
    ? ""
    : pointDeviceLink(window.location.origin, window.location.hostname, live?.code ?? null);
  const shareText = pointShareText(live?.code ?? null);

  const createCode = () => {
    setPending(true);
    setError(null);
    setCopied(false);
    void fetch("/api/business/point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "create", locationId }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; code?: string; expiresAt?: string; error?: string }) => {
        if (json.ok === true && json.code) {
          setNow(Date.now());
          setIssued({ code: json.code, expiresAt: json.expiresAt ?? null });
        } else setError(json.error ?? "Не удалось создать код. Попробуйте ещё раз.");
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
          setIssued(null);
        } else setError(json.error ?? "Не удалось отключить устройство. Попробуйте ещё раз.");
      })
      .catch(() => setError("Не удалось отключить устройство. Попробуйте ещё раз."))
      .finally(() => setPending(false));
  };

  const share = () => {
    const nav = typeof navigator === "undefined" ? null : navigator;
    if (!nav || typeof nav.share !== "function") {
      setMore(true);
      return;
    }
    // Opens the phone share sheet: MAX, Telegram, почта, Quick Share, AirDrop, Bluetooth.
    nav.share({ title: POINT_SHARE_TITLE, text: shareText, url: deviceUrl }).catch((err: unknown) => {
      if ((err as { name?: string } | null)?.name !== "AbortError") setMore(true);
    });
  };

  const copy = () => {
    const done = () => setCopied(true);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(deviceUrl).then(done, () => setMore(true));
    }
  };

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
            else createCode();
          }}
          onNo={() => setConfirm(null)}
        />
      ) : null}
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Устройство в зале</h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Код из 4 цифр действует 10 минут. Отправьте ссылку на устройство у колонки в кофейне – оно подключится само.
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
      <div className="flex flex-wrap gap-2">
        {live ? (
          <button
            type="button"
            className="business-app-btn business-app-btn-primary business-app-focus-ring"
            onClick={share}
            data-testid="biz-point-share"
          >
            Поделиться ссылкой на устройство
          </button>
        ) : null}
        <button
          type="button"
          className={`business-app-btn ${live ? "business-app-btn-secondary" : "business-app-btn-primary"} business-app-focus-ring`}
          onClick={() => ask("create")}
          disabled={pending || confirm !== null}
          data-testid="biz-point-create"
        >
          {live ? "Новый код" : "Получить код для устройства"}
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
      {live ? (
        <div className="space-y-3">
          {more ? null : (
            <button
              type="button"
              className="text-sm font-medium text-[var(--biz-text-muted)] underline business-app-focus-ring"
              onClick={() => setMore(true)}
              data-testid="biz-point-share-more"
            >
              Другие способы: ссылка, Телеграм, почта, код для камеры
            </button>
          )}
          {more ? (
            <div className="space-y-3" data-testid="biz-point-share-fallback">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="business-app-btn business-app-btn-secondary business-app-focus-ring"
                  onClick={copy}
                  data-testid="biz-point-copy"
                >
                  {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
                </button>
                <a
                  className="business-app-btn business-app-btn-secondary business-app-focus-ring"
                  href={pointTelegramShareUrl(deviceUrl, shareText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="biz-point-telegram"
                >
                  Телеграм
                </a>
                <a
                  className="business-app-btn business-app-btn-secondary business-app-focus-ring"
                  href={pointMailtoUrl(deviceUrl, shareText)}
                  data-testid="biz-point-mail"
                >
                  Почта
                </a>
              </div>
              <input
                readOnly
                className="business-app-input w-full text-sm"
                value={deviceUrl}
                aria-label="Ссылка на страницу подключения"
                onFocus={(event) => event.currentTarget.select()}
                data-testid="biz-point-link"
              />
              <div className="space-y-1">
                <PointQrCode value={deviceUrl} label="Код для камеры со ссылкой на страницу подключения" />
                <p className="text-sm text-[var(--biz-text-muted)]">
                  Наведите камеру устройства у колонки на этот код – откроется страница подключения.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
