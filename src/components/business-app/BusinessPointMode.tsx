"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const PointModeContext = createContext(false);

/** True only when this browser is the paired venue device. */
export function BusinessPointModeProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <PointModeContext.Provider value={value}>{children}</PointModeContext.Provider>;
}

export function usePointMode(): boolean {
  return useContext(PointModeContext);
}

type Entry = "person" | "venue";

const EntryContext = createContext<{ entry: Entry; setEntry: (entry: Entry) => void }>({
  entry: "person",
  setEntry: () => {},
});

/** Which side of the header switcher is open. This is not the venue cookie. */
export function BusinessEntryProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry>("person");
  return <EntryContext.Provider value={{ entry, setEntry }}>{children}</EntryContext.Provider>;
}

export function useBusinessEntry() {
  return useContext(EntryContext);
}
