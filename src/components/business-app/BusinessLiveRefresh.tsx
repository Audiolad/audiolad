"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  BUSINESS_LIVE_REFRESH_PAUSE_SELECTOR,
  businessLiveRefreshPath,
  isTypingTarget,
  startBusinessLiveRefresh,
  type BusinessLiveRefreshEnv,
} from "@/lib/business-app/live-refresh";
import { normalizeBusinessAppPathname } from "@/lib/business-app/host";
import { restoreWindowScrollY } from "@/lib/public-content/live-sync";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

function browserEnv(isBusy: () => boolean): BusinessLiveRefreshEnv {
  return {
    now: () => Date.now(),
    isHidden: () => document.visibilityState === "hidden",
    isBusy: () =>
      isBusy() ||
      isTypingTarget(document.activeElement as HTMLInputElement | null) ||
      document.querySelector(BUSINESS_LIVE_REFRESH_PAUSE_SELECTOR) !== null,
    schedule: (callback, ms) => window.setInterval(callback, ms),
    cancel: (timerId) => window.clearInterval(timerId as number),
    addWakeListener: (callback) => {
      const onVisibility = () => {
        if (document.visibilityState === "visible") callback();
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", callback);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", callback);
      };
    },
    addActivityListener: (callback) => {
      ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, callback, { passive: true }));
      return () => ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, callback));
    },
  };
}

/**
 * Soft-refreshes the cabinet screen every few seconds (see live-refresh.ts). Mounted once in
 * the shell; it runs only on the screens listed in BUSINESS_LIVE_REFRESH_ROUTES and only for
 * a signed-in owner or the paired venue device.
 */
export default function BusinessLiveRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const pathname = normalizeBusinessAppPathname(usePathname() ?? "");
  const active = enabled && businessLiveRefreshPath(pathname);
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!active) return;
    return startBusinessLiveRefresh(
      () => {
        const scrollY = window.scrollY;
        startTransition(() => router.refresh());
        const restore = () => restoreWindowScrollY(scrollY);
        requestAnimationFrame(restore);
        window.setTimeout(restore, 50);
      },
      browserEnv(() => pendingRef.current),
    );
  }, [active, router]);

  return null;
}
