"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import PlatformSearchCombobox, {
  PlatformSearchSkeleton,
} from "@/components/listener/PlatformSearchCombobox";
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
 * Desktop-only shell search. Hidden on /catalog, where the catalog row owns search.
 * Does not mount a search form below the xl breakpoint,
 * so mobile listener pages keep zero search forms in the DOM.
 */
export default function DesktopShellSearch() {
  const pathname = usePathname();
  const mounted = useClientMounted();
  const isDesktop = useListenerDesktopViewport();
  const isCatalogRoute =
    pathname === "/catalog" || pathname.startsWith("/catalog");

  if (isCatalogRoute) {
    return null;
  }

  if (!mounted) {
    return <PlatformSearchSkeleton />;
  }

  if (!isDesktop) {
    return null;
  }

  return <PlatformSearchCombobox />;
}
