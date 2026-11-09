"use client";

import { useEffect, useSyncExternalStore } from "react";

import { parsePartnerQuote, type PartnerQuote } from "@/lib/business/partner-codes";

/**
 * One server quote per page for every «Оплатить» surface (8142d69a). It only shows the
 * price; the checkout recomputes it on the server and refuses a price that was not shown.
 */
type State = { status: "idle" | "loading" | "ready"; quote: PartnerQuote | null };

let state: State = { status: "idle", quote: null };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPartnerQuote(): PartnerQuote | null {
  return state.quote;
}

export function setPartnerQuote(quote: PartnerQuote | null) {
  emit({ status: "ready", quote });
}

/** Test hook: forget the loaded quote. */
export function resetPartnerQuoteStore(next: State = { status: "idle", quote: null }) {
  emit(next);
}

/** Loads once; also claims a code kept from a personal link opened before sign-up. */
export function loadPartnerQuote(): void {
  if (state.status !== "idle") return;
  emit({ status: "loading", quote: state.quote });
  void fetch("/api/business/partner-code", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as { quote?: unknown } | null;
      emit({ status: "ready", quote: response.ok ? parsePartnerQuote(payload?.quote) : null });
    })
    .catch(() => emit({ status: "ready", quote: null }));
}

export function usePartnerQuote(enabled: boolean): PartnerQuote | null {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (enabled) loadPartnerQuote();
  }, [enabled]);
  return enabled ? snapshot.quote : null;
}
