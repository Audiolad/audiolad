"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Modal behaviour for an overlay portalled into `.business-app-root`:
 * focus goes to `initialFocus`, Tab stays inside `card`, Escape closes,
 * everything next to the overlay is inert, body scroll is locked, and
 * focus returns to the opener on close. No navigation – the player keeps playing.
 */
export function useModalDialog(
  overlayRef: RefObject<HTMLElement | null>,
  cardRef: RefObject<HTMLElement | null>,
  initialFocus: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Everything next to the overlay becomes inert (not focusable, not clickable).
    // Audio keeps playing: inert only blocks input.
    const overlay = overlayRef.current;
    const siblings = overlay?.parentElement
      ? Array.from(overlay.parentElement.children).filter(
          (el): el is HTMLElement => el !== overlay && el instanceof HTMLElement && !el.inert,
        )
      : [];
    for (const el of siblings) el.inert = true;
    initialFocus.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      const card = cardRef.current;
      if (event.key !== "Tab" || !card) return;
      const focusable = Array.from(card.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !card.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !card.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      for (const el of siblings) el.inert = false;
      previous?.focus?.();
    };
  }, [overlayRef, cardRef, initialFocus]);
}

/** Where business overlays are portalled (theme variables live there). */
export function modalHost(): HTMLElement {
  return document.querySelector<HTMLElement>(".business-app-root") ?? document.body;
}
