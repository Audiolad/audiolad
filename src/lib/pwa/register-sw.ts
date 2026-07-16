"use client";

import type { PwaPlatform } from "@/lib/pwa/constants";

export async function syncPwaProfileState(input: {
  action: "installed" | "standalone_open";
  platform: PwaPlatform;
}): Promise<void> {
  try {
    await fetch("/api/pwa/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: input.action,
        platform: input.platform,
      }),
      keepalive: true,
    });
  } catch {
    // Non-blocking server sync
  }
}

export function registerPwaServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;

          if (!installing) {
            return;
          }

          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              installing.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {
        // SW registration failure must not break the app
      });
  } catch {
    // SW registration failure must not break the app
  }
}
