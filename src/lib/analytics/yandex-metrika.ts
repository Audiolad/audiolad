import type { PlatformAnalyticsEventName } from "@/lib/analytics/constants";
import { isAnalyticsConsentGranted } from "@/lib/analytics/analytics-consent";

export const YANDEX_METRIKA_GOALS = new Set<PlatformAnalyticsEventName>([
  "signup_completed",
  "audio_play_started",
  "audio_completed",
  "author_application_submitted",
]);

let initializedCounterId: number | null = null;

export function getYandexMetrikaCounterId(): number | null {
  const raw = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();

  if (!raw) {
    return null;
  }

  const counterId = Number.parseInt(raw, 10);

  if (!Number.isFinite(counterId) || counterId <= 0) {
    return null;
  }

  return counterId;
}

export function initYandexMetrika(counterId: number): void {
  if (typeof window === "undefined" || typeof window.ym !== "function") {
    return;
  }

  if (!isAnalyticsConsentGranted()) {
    return;
  }

  if (initializedCounterId === counterId) {
    return;
  }

  window.ym(counterId, "init", {
    clickmap: false,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  });

  initializedCounterId = counterId;
}

export function reachYandexMetrikaHit(url: string): void {
  const counterId = getYandexMetrikaCounterId();

  if (!counterId || typeof window === "undefined" || typeof window.ym !== "function") {
    return;
  }

  if (!isAnalyticsConsentGranted()) {
    return;
  }

  window.ym(counterId, "hit", url, {
    title: document.title,
  });
}

export function reachYandexMetrikaGoal(eventName: PlatformAnalyticsEventName): void {
  if (!YANDEX_METRIKA_GOALS.has(eventName)) {
    return;
  }

  const counterId = getYandexMetrikaCounterId();

  if (!counterId || typeof window === "undefined" || typeof window.ym !== "function") {
    return;
  }

  if (!isAnalyticsConsentGranted()) {
    return;
  }

  window.ym(counterId, "reachGoal", eventName);
}

declare global {
  interface Window {
    ym?: (counterId: number, method: string, ...args: unknown[]) => void;
  }
}

export {};
