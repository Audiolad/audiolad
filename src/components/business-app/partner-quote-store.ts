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

async function postPartnerQuoteFromCookie(): Promise<PartnerQuote | null> {
  try {
    const response = await fetch("/api/business/partner-code", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = (await response.json().catch(() => null)) as { quote?: unknown } | null;
    const quote = response.ok ? parsePartnerQuote(payload?.quote) : null;
    emit({ status: "ready", quote });
    return quote;
  } catch {
    emit({ status: "ready", quote: null });
    return null;
  }
}

/** Loads once; also claims a code kept from a personal link opened before sign-up. */
export function loadPartnerQuote(): void {
  if (state.status !== "idle") return;
  emit({ status: "loading", quote: state.quote });
  void postPartnerQuoteFromCookie();
}

/**
 * t1322u: after partner_terms_changed, re-reserve from the cookie and reload the quote
 * before retrying pay – do not fall back to the standard 799 price while the code is still open.
 */
export async function refreshPartnerQuoteFromCookie(): Promise<PartnerQuote | null> {
  emit({ status: "loading", quote: state.quote });
  return postPartnerQuoteFromCookie();
}

export function usePartnerQuote(enabled: boolean): PartnerQuote | null {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (enabled) loadPartnerQuote();
  }, [enabled]);
  return enabled ? snapshot.quote : null;
}
