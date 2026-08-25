"use client";

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
 * Mobile-only catalog inline search. Desktop catalog chrome lives in
 * DesktopShellSearch, above center-scroll.
 */
export default function MobileCatalogSearch() {
  const mounted = useClientMounted();
  const isDesktop = useListenerDesktopViewport();

  if (!mounted || isDesktop) {
    return null;
  }

  return (
    <Suspense fallback={<PlatformSearchSkeleton density="compact" />}>
      <PlatformCatalogInlineSearch density="compact" />
    </Suspense>
  );
}
