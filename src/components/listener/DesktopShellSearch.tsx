"use client";

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
 * Desktop-only shell search. Does not mount a search form below the xl breakpoint,
 * so mobile listener pages keep zero search forms in the DOM.
 */
export default function DesktopShellSearch() {
  const mounted = useClientMounted();
  const isDesktop = useListenerDesktopViewport();

  if (!mounted) {
    return <PlatformSearchSkeleton />;
  }

  if (!isDesktop) {
    return null;
  }

  return <PlatformSearchCombobox />;
}
