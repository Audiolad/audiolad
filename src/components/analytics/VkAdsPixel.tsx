"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { createVkAdsTracker, vkDestinationGoal, vkPixelId } from "@/lib/analytics/vk-ads.mjs";

/** Must come from the existing account consent authority, never analytics localStorage.
 * Unknown deliberately disables the integration until that authority is connected.
 */
export default function VkAdsPixel({ accountAdvertisingConsent = "unknown" }: {
  accountAdvertisingConsent?: "granted" | "denied" | "unknown";
}) {
  const pathname = usePathname();
  const consent = useRef(accountAdvertisingConsent);
  const tracker = useRef<ReturnType<typeof createVkAdsTracker> | null>(null);

  useEffect(() => {
    consent.current = accountAdvertisingConsent;
    tracker.current ??= createVkAdsTracker({
      pixelId: vkPixelId(process.env.NEXT_PUBLIC_VK_PIXEL_ID),
      allowed: () => consent.current === "granted",
      win: window,
      doc: document,
    });
    tracker.current.page();
    window.dispatchEvent(new Event("audiolad:vk-business-access-request"));
  }, [accountAdvertisingConsent, pathname]);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-vk-gift-interest]')) tracker.current?.goal("gift_interest");
      const anchor = event.target.closest("a[href]");
      const href = anchor?.getAttribute("href");
      const goal = href ? vkDestinationGoal(href, window.location.origin) : null;
      if (goal) tracker.current?.goal(goal);
    };
    const access = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") tracker.current?.access(event.detail);
    };
    document.addEventListener("click", click);
    window.addEventListener("audiolad:vk-business-access", access);
    return () => {
      consent.current = "unknown";
      document.removeEventListener("click", click);
      window.removeEventListener("audiolad:vk-business-access", access);
    };
  }, []);
  return null;
}
