"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { createVkAdsTracker, vkDestinationGoal, vkPixelId } from "@/lib/analytics/vk-ads.mjs";

import { readAdvertisingConsent } from "@/lib/analytics/advertising-consent.mjs";
import { useAdvertisingConsent } from "@/lib/analytics/use-advertising-consent";

/** Advertising consent is independent of the analytics choice. */
export default function VkAdsPixel() {
  const pathname = usePathname();
  const consent = useAdvertisingConsent();
  const tracker = useRef<ReturnType<typeof createVkAdsTracker> | null>(null);

  useEffect(() => {
    tracker.current ??= createVkAdsTracker({
      pixelId: vkPixelId(process.env.NEXT_PUBLIC_VK_PIXEL_ID),
      allowed: () => readAdvertisingConsent() === "granted",
      win: window,
      doc: document,
    });
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
      document.removeEventListener("click", click);
      window.removeEventListener("audiolad:vk-business-access", access);
    };
  }, []);
  useEffect(() => {
    tracker.current?.page();
    // Listener above is installed before a synchronous access response can arrive.
    window.dispatchEvent(new Event("audiolad:vk-business-access-request"));
  }, [consent, pathname]);
  return null;
}
