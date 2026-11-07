"use client";

import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";

import { createPortal } from "react-dom";

import { findClientDocument } from "@/lib/business-app/client-documents";
import { BUSINESS_OFFER_LINK_ATTR, sheetHost, themeOfRoot } from "./BusinessOfferDocumentLink";

const PRIVACY_ENTRY = findClientDocument("privacy");
export const BUSINESS_PRIVACY_HREF = "/documents/privacy";
export const BUSINESS_PRIVACY_TITLE = PRIVACY_ENTRY?.title ?? "Политика обработки персональных данных";
const PRIVACY_EDITION_LABEL = PRIVACY_ENTRY?.editionLabel;

/**
 * Link to the privacy policy next to the offer in the guest form.
 *
 * Same behaviour as BusinessOfferDocumentLink: a plain click opens the policy in an in-app
 * sheet over the current screen, no navigation, so the form and the music stay. href stays
 * the real /documents/privacy page for modifier clicks, crawlers and no-JS.
 */
export function BusinessPrivacyDocumentLink({
  testId,
  className,
  children = BUSINESS_PRIVACY_TITLE,
}: {
  testId?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const onClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <a href={BUSINESS_PRIVACY_HREF} className={className ?? BUSINESS_OFFER_LINK_ATTR} data-testid={testId} aria-haspopup="dialog" onClick={onClick}>
        {children}
      </a>
      {/* Portal onto the themed .business-app-root, like the offer sheet: tokens live there. */}
      {open ? createPortal(<BusinessPrivacyDocumentSheet onClose={close} testId={testId ? `${testId}-sheet` : undefined} theme={themeOfRoot()} />, sheetHost()) : null}
    </>
  );
}

export function BusinessPrivacyDocumentSheet({
  onClose,
  testId = "biz-privacy-sheet",
  initialBody = null,
  theme,
}: {
  onClose: () => void;
  theme?: string;
  testId?: string;
  /** For tests and server render; the client loads PrivacyDocument on demand to keep the cabinet bundle small. */
  initialBody?: ComponentType | null;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [Body, setBody] = useState<ComponentType | null>(() => initialBody);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (Body) return;
    let alive = true;
    import("@/components/legal/PrivacyDocument")
      .then((m) => { if (alive) setBody(() => m.default); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [Body]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-[rgba(0,0,0,0.5)] sm:items-center"
      data-biz-theme={theme}
      data-testid={testId}
      onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="business-app-card bg-[var(--biz-surface)] text-[var(--biz-text)] flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-b-none sm:rounded-b-[inherit]"
        data-document-id="privacy"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--biz-border,rgba(0,0,0,0.08))] pb-3">
          <div>
            <h2 id={titleId} className="text-[1.2rem] font-bold tracking-tight text-[var(--biz-text)]">{BUSINESS_PRIVACY_TITLE}</h2>
            {PRIVACY_EDITION_LABEL ? <p className="mt-1 text-sm text-[var(--biz-text-muted)]" data-testid={`${testId}-edition`}>{PRIVACY_EDITION_LABEL}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="business-app-btn business-app-btn-secondary business-app-focus-ring shrink-0"
            onClick={onClose}
            data-testid={`${testId}-close`}
          >
            Закрыть
          </button>
        </div>
        <div className="-mx-1 overflow-y-auto overscroll-contain px-1 pt-3" data-testid={`${testId}-body`}>
          {Body ? (
            <Body />
          ) : failed ? (
            <p role="alert">Не получилось загрузить текст. Документ доступен в разделе «Документы».</p>
          ) : (
            <p aria-busy="true">Загружаем текст политики…</p>
          )}
        </div>
        <div className="border-t border-[var(--biz-border,rgba(0,0,0,0.08))] pt-3">
          <button
            type="button"
            className="business-app-btn business-app-btn-secondary business-app-focus-ring w-full"
            onClick={onClose}
            data-testid={`${testId}-done`}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
