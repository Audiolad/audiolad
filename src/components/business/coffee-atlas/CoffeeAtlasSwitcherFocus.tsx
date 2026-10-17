"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the current coffee shop chip visible in the horizontally scrolling
 * switcher on phones (horizontal scroll only — never moves the page).
 */
export default function CoffeeAtlasSwitcherFocus({ currentSlug }: { currentSlug?: string }) {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const list = markerRef.current?.closest("nav")?.querySelector<HTMLElement>(".atlas-switcher__list");
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) {
      return;
    }
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const target =
      list.scrollLeft + (activeRect.left - listRect.left) - (listRect.width - activeRect.width) / 2;
    list.scrollLeft = Math.max(0, target);
  }, [currentSlug]);

  return <span ref={markerRef} hidden />;
}
