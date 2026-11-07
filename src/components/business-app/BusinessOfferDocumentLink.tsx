"use client";

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { createPortal } from "react-dom";

import SimpleMarkdown from "@/components/legal/SimpleMarkdown";
import { BUSINESS_OFFER_EDITION, BUSINESS_OFFER_HREF, BUSINESS_OFFER_TITLE } from "@/lib/business/offer";

type OfferSource = { markdown: string; sha256: string; version: string };

/** The first «# title» line is the sheet heading; the rest is the accepted text as written. */
function bodyWithoutTitle(markdown: string): string {
  return markdown.replace(/^# [^\n]*\n+/, "");
}

/**
 * Link to the договор-оферта that «Принять условия» records and «Оплатить» pays under.
 *
 * A plain click opens the same edition in an in-app sheet over the current screen: no new
 * standalone PWA window (logo splash), no navigation, so payment form state and the music
 * keep going. href stays the real document page for modifier clicks, crawlers and no-JS.
 */
export const BUSINESS_OFFER_LINK_ATTR = "font-semibold text-[var(--biz-text)] underline underline-offset-2 business-app-focus-ring";

export function sheetHost(): HTMLElement {
  return document.querySelector<HTMLElement>(".business-app-root") ?? document.body;
}

/** Fallback when the sheet ends up on document.body: carry the live theme id so tokens apply. */
export function themeOfRoot(): string | undefined {
  return document.querySelector<HTMLElement>(".business-app-root")?.dataset.bizTheme;
}

export function BusinessOfferDocumentLink({
  testId,
  className,
  children = BUSINESS_OFFER_TITLE,
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
      <a
        href={BUSINESS_OFFER_HREF}
        className={className ?? BUSINESS_OFFER_LINK_ATTR}
        data-testid={testId}
        data-offer-version={BUSINESS_OFFER_EDITION.version}
        aria-haspopup="dialog"
        onClick={onClick}
      >
        {children}
      </a>
      {/* Portal: the link sits inside <p>/<label> text, a <div> sheet must not nest there.
          Theme tokens (--biz-surface etc.) live on .business-app-root, so the sheet goes there:
          on document.body the card had no background and the contract mixed with the page. */}
      {open ? createPortal(<BusinessOfferDocumentSheet onClose={close} testId={testId ? `${testId}-sheet` : undefined} theme={themeOfRoot()} />, sheetHost()) : null}
    </>
  );
}

export function BusinessOfferDocumentSheet({
  onClose,
  testId = "biz-offer-sheet",
  initialSource = null,
  theme,
}: {
  onClose: () => void;
  /** data-biz-theme of the cabinet, so the card keeps its opaque surface wherever it is mounted. */
  theme?: string;
  testId?: string;
  /** For tests and server render; the client loads the text on demand to keep the cabinet bundle small. */
  initialSource?: OfferSource | null;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [source, setSource] = useState<OfferSource | null>(initialSource);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (source) return;
    let alive = true;
    import("@/lib/business-app/business-offer-content")
      .then((m) => { if (alive) setSource(m.BUSINESS_OFFER_SOURCE); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [source]);

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

  // Only the accepted edition may be shown here: never a different text under the same link.
  const mismatch = source !== null && source.version !== BUSINESS_OFFER_EDITION.version;

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
        data-document-id={BUSINESS_OFFER_EDITION.documentKey}
        data-document-version={BUSINESS_OFFER_EDITION.version}
        data-document-sha256={BUSINESS_OFFER_EDITION.contentHash}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--biz-border,rgba(0,0,0,0.08))] pb-3">
          <div>
            <h2 id={titleId} className="text-[1.2rem] font-bold tracking-tight text-[var(--biz-text)]">{BUSINESS_OFFER_TITLE}</h2>
            <p className="mt-1 text-sm text-[var(--biz-text-muted)]" data-testid={`${testId}-edition`}>{BUSINESS_OFFER_EDITION.label}</p>
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
        <div className="business-app-prose -mx-1 overflow-y-auto overscroll-contain px-1 pt-3" data-testid={`${testId}-body`}>
          {source && !mismatch ? (
            <SimpleMarkdown source={bodyWithoutTitle(source.markdown)} />
          ) : failed || mismatch ? (
            <p role="alert">Не получилось загрузить текст. Документ доступен в разделе «Документы».</p>
          ) : (
            <p aria-busy="true">Загружаем текст договора…</p>
          )}
        </div>
        {/* Not a main CTA: the green primary stays on «Принять условия» / «Оплатить» under the sheet. */}
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
