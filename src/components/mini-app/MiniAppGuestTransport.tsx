"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { MiniAppGuestTransport } from "@/lib/mini-app/guest-transport";

const MiniAppGuestTransportContext = createContext<MiniAppGuestTransport | null>(null);

export function MiniAppGuestTransportProvider({
  value,
  children,
}: {
  value: MiniAppGuestTransport;
  children: ReactNode;
}) {
  return (
    <MiniAppGuestTransportContext.Provider value={value}>
      {children}
    </MiniAppGuestTransportContext.Provider>
  );
}

/** Null on MAX, where views keep posting initData themselves. */
export function useMiniAppGuestTransport(): MiniAppGuestTransport | null {
  return useContext(MiniAppGuestTransportContext);
}
