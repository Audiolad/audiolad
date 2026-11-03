"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { businessEntryCookieValue, type BusinessEntry } from "@/lib/business-app/live-refresh";

const PointModeContext = createContext(false);

/** True only when this browser is the paired venue device. */
export function BusinessPointModeProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <PointModeContext.Provider value={value}>{children}</PointModeContext.Provider>;
}

export function usePointMode(): boolean {
  return useContext(PointModeContext);
}

type Entry = BusinessEntry;

const EntryContext = createContext<{ entry: Entry; setEntry: (entry: Entry) => void }>({
  entry: "person",
  setEntry: () => {},
});

/**
 * Which side of the header switcher is open. This is not the venue cookie.
 * The choice is kept in a small UI cookie, so a reload or a new tab opens the same side
 * (the layout reads it for the first render, without a flash of the other side).
 */
export function BusinessEntryProvider({ initialEntry = "person", children }: { initialEntry?: Entry; children: ReactNode }) {
  const [entry, setEntryState] = useState<Entry>(initialEntry);
  const setEntry = useCallback((next: Entry) => {
    setEntryState(next);
    try {
      document.cookie = businessEntryCookieValue(next, window.location.protocol === "https:");
    } catch {
      /* cookies off: the choice lasts for this visit */
    }
  }, []);
  const value = useMemo(() => ({ entry, setEntry }), [entry, setEntry]);
  return <EntryContext.Provider value={value}>{children}</EntryContext.Provider>;
}

export function useBusinessEntry() {
  return useContext(EntryContext);
}
