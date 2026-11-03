"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Modal behaviour for overlays portalled into `.business-app-root`:
 * focus goes to `initialFocus`, Tab stays inside the card, Escape closes,
 * everything next to the overlay is inert, body scroll is locked, and
 * focus returns to the opener on close. No navigation – the player keeps playing.
 *
 * All open dialogs share one stack: only the top dialog handles keys and owns
 * the inert background; scroll lock and the key listener are set up when the
 * first dialog opens and restored only after the last one closes.
 */

type FocusTarget = { focus?: () => void };
type InertNode = { inert: boolean };
type OverlayNode = { parentElement: { children: ArrayLike<unknown> } | null };
type CardNode = {
  contains(node: unknown): boolean;
  querySelectorAll(selector: string): ArrayLike<FocusTarget>;
};
type KeyLike = { key: string; shiftKey: boolean; preventDefault(): void };
export type ModalDocument = {
  activeElement: unknown;
  body: { style: { overflow: string } };
  addEventListener(type: "keydown", listener: (event: KeyLike) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyLike) => void): void;
};

export type ModalEntry = {
  overlay: () => OverlayNode | null;
  card: () => CardNode | null;
  close: () => void;
  previous: FocusTarget | null;
};

type ModalStack = {
  doc: ModalDocument;
  entries: ModalEntry[];
  inerted: InertNode[];
  overflow: string;
  onKey: (event: KeyLike) => void;
};

const stacks = new WeakMap<ModalDocument, ModalStack>();

function isInertNode(node: unknown): node is InertNode {
  return typeof node === "object" && node !== null && "inert" in node;
}

function applyInert(stack: ModalStack): void {
  for (const el of stack.inerted) el.inert = false;
  stack.inerted = [];
  const overlay = stack.entries.at(-1)?.overlay();
  const parent = overlay?.parentElement;
  if (!parent) return;
  for (const el of Array.from(parent.children)) {
    if (el === overlay || !isInertNode(el) || el.inert) continue;
    el.inert = true;
    stack.inerted.push(el);
  }
}

function getStack(doc: ModalDocument): ModalStack {
  let stack = stacks.get(doc);
  if (!stack) {
    const created: ModalStack = {
      doc,
      entries: [],
      inerted: [],
      overflow: "",
      onKey: (event) => {
        const top = created.entries.at(-1);
        if (!top) return;
        if (event.key === "Escape") {
          top.close();
          return;
        }
        const card = top.card();
        if (event.key !== "Tab" || !card) return;
        const focusable = Array.from(card.querySelectorAll("button:not([disabled]), a[href]"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = doc.activeElement;
        if (event.shiftKey && (active === first || !card.contains(active))) {
          event.preventDefault();
          last.focus?.();
        } else if (!event.shiftKey && (active === last || !card.contains(active))) {
          event.preventDefault();
          first.focus?.();
        }
      },
    };
    stack = created;
    stacks.set(doc, stack);
  }
  return stack;
}

/** Puts a dialog on top of the shared stack. */
export function openModal(doc: ModalDocument, entry: ModalEntry): void {
  const stack = getStack(doc);
  if (stack.entries.includes(entry)) return;
  if (stack.entries.length === 0) {
    stack.overflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
    doc.addEventListener("keydown", stack.onKey);
  }
  stack.entries.push(entry);
  applyInert(stack);
}

/** Removes a dialog; global state is restored only after the last one closes. */
export function closeModal(doc: ModalDocument, entry: ModalEntry): void {
  const stack = getStack(doc);
  const index = stack.entries.indexOf(entry);
  if (index === -1) return;
  const wasTop = index === stack.entries.length - 1;
  stack.entries.splice(index, 1);
  applyInert(stack);
  if (stack.entries.length === 0) {
    doc.removeEventListener("keydown", stack.onKey);
    doc.body.style.overflow = stack.overflow;
  }
  if (wasTop) entry.previous?.focus?.();
}

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
    const entry: ModalEntry = {
      overlay: () => overlayRef.current,
      card: () => cardRef.current,
      close: () => onCloseRef.current(),
      previous: document.activeElement as HTMLElement | null,
    };
    openModal(document, entry);
    initialFocus.current?.focus();
    return () => closeModal(document, entry);
  }, [overlayRef, cardRef, initialFocus]);
}

/** Where business overlays are portalled (theme variables live there). */
export function modalHost(): HTMLElement {
  return document.querySelector<HTMLElement>(".business-app-root") ?? document.body;
}
