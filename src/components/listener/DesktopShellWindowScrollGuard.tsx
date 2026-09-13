"use client";

import { useLayoutEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { LISTENER_DESKTOP_MEDIA_QUERY } from "@/lib/listener/desktop-viewport";
import { resetDesktopShellWindowScroll } from "@/lib/navigation/reset-desktop-shell-window-scroll";

/**
 * After desktop listener navigations (Link topic chips, query replace,
 * Back/Forward), keep `window.scrollY = 0` so the shell stays at the
 * viewport top. Does not reset center-scroll and does not run on mobile.
 */
export default function DesktopShellWindowScrollGuard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useLayoutEffect(() => {
    resetDesktopShellWindowScroll();

    const media = window.matchMedia(LISTENER_DESKTOP_MEDIA_QUERY);
    const sync = () => {
      resetDesktopShellWindowScroll();
    };
    media.addEventListener("change", sync);

    // Re-assert after Next's layout-router scroll pass in the same tick.
    const frameId = window.requestAnimationFrame(sync);

    return () => {
      media.removeEventListener("change", sync);
      window.cancelAnimationFrame(frameId);
    };
  }, [pathname, search]);

  return null;
}
