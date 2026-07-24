"use client";

import { useLayoutEffect } from "react";

import { resetAppScrollPosition } from "@/lib/navigation/reset-app-scroll";

/**
 * Ensures `/become-author` always opens at the top for soft navigations from
 * scrolled pages (e.g. `/authors` CTA). Runs on mount for both the page and
 * `loading.tsx`, which share `BecomeAuthorShell`.
 */
export default function BecomeAuthorScrollReset() {
  useLayoutEffect(() => {
    resetAppScrollPosition();

    // Re-assert after Next's layout-router scroll pass in the same frame tick.
    const frameId = window.requestAnimationFrame(() => {
      resetAppScrollPosition();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return null;
}
