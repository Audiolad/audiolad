"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { normalizeBusinessAppPathname } from "@/lib/business-app/host";

/**
 * Quiet cabinet for a personal-link visitor without a paid period (Sergey t1617u/t1618u):
 * the ordinary app, but no gift or connect CTAs, prices, countdowns, banners or prompts.
 * Connecting and paying stay available only in the profile, folded under «Подключение и оплата».
 */
const QuietContext = createContext(false);

export function BusinessQuietProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <QuietContext.Provider value={value}>{children}</QuietContext.Provider>;
}

/** Quiet cabinet, or the calm entry screen of a personal link (/collection). */
export function useBusinessQuiet(): boolean {
  const quiet = useContext(QuietContext);
  const pathname = normalizeBusinessAppPathname(usePathname() ?? "");
  return quiet || pathname === "/collection";
}

/** Renders its children only outside the quiet cabinet (for server pages such as the profile). */
export function BusinessQuietHidden({ children }: { children: ReactNode }) {
  return useBusinessQuiet() ? null : <>{children}</>;
}
