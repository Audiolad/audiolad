"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import {
  businessCabinetCan,
  businessCabinetSections,
  businessCabinetSide,
  type BusinessCabinetMode,
  type BusinessCabinetPermission,
  type BusinessCabinetSectionId,
  type BusinessCabinetSide,
} from "@/lib/business-app/cabinet-mode";
import { businessEntryCookieValue, type BusinessEntry } from "@/lib/business-app/live-refresh";

/** What the server knows about this browser (layout): the hall device, its rights, the owner unlock. */
export type BusinessCabinetServerMode = {
  /** owner | preview | point, resolved on the server (cabinet-mode.server.ts). */
  mode: BusinessCabinetMode;
  /** Live device session: the hall player reports now playing (never in preview). */
  pointReports: boolean;
  /** The owner allowed the hall device to change the sound. */
  pointCanEdit: boolean;
  /** Hall device venue name (the device has no account). */
  pointVenueName: string | null;
  /** Unix seconds: the owner unlock on the hall device ends then. */
  ownerUnlockUntil: number | null;
  /** Hall device with an account session but no fresh password: the browser signs it out. */
  staleOwnerSession?: boolean;
  /** Account session id on the hall device: the cleanup signs out only this one. */
  hallSessionId?: string | null;
  /** A signed-in person may look at the cabinet «как видит точка». */
  canPreview: boolean;
};

const DEFAULT_SERVER_MODE: BusinessCabinetServerMode = {
  mode: "owner",
  pointReports: false,
  pointCanEdit: false,
  pointVenueName: null,
  ownerUnlockUntil: null,
  canPreview: false,
};

export type BusinessCabinetModeValue = BusinessCabinetServerMode & {
  side: BusinessCabinetSide;
  sections: BusinessCabinetSectionId[];
  can: (permission: BusinessCabinetPermission) => boolean;
};

const ServerModeContext = createContext<BusinessCabinetServerMode>(DEFAULT_SERVER_MODE);

type Entry = BusinessEntry;

const EntryContext = createContext<{ entry: Entry; setEntry: (entry: Entry) => void }>({
  entry: "person",
  setEntry: () => {},
});

/** Server mode of this browser for the whole cabinet. */
export function BusinessCabinetModeProvider({ value, children }: { value: BusinessCabinetServerMode; children: ReactNode }) {
  return <ServerModeContext.Provider value={value}>{children}</ServerModeContext.Provider>;
}

/**
 * The mode the screens use. The hall device and the owner unlock come from the server; the
 * owner's own preview follows the header choice at once (the server reads the same UI cookie on
 * the next request, so pages and guards agree). Everything reads one table: cabinet-mode.ts.
 */
export function useBusinessCabinetMode(): BusinessCabinetModeValue {
  const server = useContext(ServerModeContext);
  const { entry } = useContext(EntryContext);
  return useMemo(() => {
    const mode: BusinessCabinetMode =
      server.mode === "point" ? "point" : server.pointReports ? "owner" : entry === "venue" && server.canPreview ? "preview" : "owner";
    const input = { mode, pointCanEdit: server.pointCanEdit };
    return {
      ...server,
      mode,
      side: businessCabinetSide(mode),
      sections: businessCabinetSections(input),
      can: (permission: BusinessCabinetPermission) => businessCabinetCan(input, permission),
    };
  }, [server, entry]);
}

/** True only on the hall device while the owner has not re-entered the password. */
export function usePointMode(): boolean {
  return useBusinessCabinetMode().mode === "point";
}

/**
 * Which side of the header switcher the owner looks at: the owner's own cabinet or the preview
 * «как видит точка». The choice is a session UI cookie (closing the browser returns to the owner
 * side); the layout reads it for the first render, without a flash of the other side.
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
