"use client";

import { usePathname } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";

import PlatformCatalogInlineSearch from "@/components/listener/PlatformCatalogInlineSearch";
import { PlatformSearchSkeleton } from "@/components/listener/PlatformSearchField";
import {
  getListenerDesktopViewportServerSnapshot,
  getListenerDesktopViewportSnapshot,
  subscribeListenerDesktopViewport,
} from "@/lib/listener/desktop-viewport";

function useClientMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function useListenerDesktopViewport(): boolean {
  return useSyncExternalStore(
    subscribeListenerDesktopViewport,
    getListenerDesktopViewportSnapshot,
    getListenerDesktopViewportServerSnapshot,
  );
}

/**
 * Compact catalog inline search. Always mounted on /catalog (desktop shell search is hidden).
 * On other pages it stays mobile-only so desktop keeps the shell combobox.
 */
export default function MobileCatalogSearch() {
  const pathname = usePathname();
  const mounted = useClientMounted();
  const isDesktop = useListenerDesktopViewport();
  const isCatalogRoute =
    pathname === "/catalog" || pathname.startsWith("/catalog");

  if (!isCatalogRoute && (!mounted || isDesktop)) {
    return null;
  }

  return (
    <Suspense fallback={<PlatformSearchSkeleton density="compact" />}>
      <PlatformCatalogInlineSearch density="compact" />
    </Suspense>
  );
}
