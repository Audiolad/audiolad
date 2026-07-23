import { isAnalyticsConsentGranted } from "@/lib/analytics/analytics-consent";
import { shouldEnableYandexMetrika } from "@/lib/analytics/yandex-metrika-environment";
import {
  isYandexMetrikaGoalName,
  YANDEX_METRIKA_CORE_GOALS,
  YANDEX_METRIKA_PWA_GOALS,
  YANDEX_METRIKA_RETENTION_GOALS,
  type YandexMetrikaGoalName,
} from "@/lib/analytics/yandex-metrika-goals";
import {
  inferRetentionMetrikaSource,
  sanitizeYandexMetrikaGoalParams,
  type YandexMetrikaGoalParams,
} from "@/lib/analytics/yandex-metrika-params";
import { setupYandexMetrikaPrivacyMasking } from "@/lib/analytics/yandex-metrika-privacy";
import { sanitizeMetrikaPageUrl } from "@/lib/analytics/yandex-metrika-url";
import type { PlatformAnalyticsEventName } from "@/lib/analytics/constants";

export {
  isYandexMetrikaGoalName,
  YANDEX_METRIKA_CORE_GOALS,
  YANDEX_METRIKA_PWA_GOALS,
  YANDEX_METRIKA_RETENTION_GOALS,
  type YandexMetrikaGoalName,
};

export const YANDEX_METRIKA_GOALS = new Set<YandexMetrikaGoalName>([
  ...YANDEX_METRIKA_CORE_GOALS,
  ...YANDEX_METRIKA_RETENTION_GOALS,
  ...YANDEX_METRIKA_PWA_GOALS,
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

function canUseYandexMetrika(pathname?: string | null): boolean {
  try {
    if (!getYandexMetrikaCounterId()) {
      return false;
    }

    if (typeof window === "undefined" || typeof window.ym !== "function") {
      return false;
    }

    if (!isAnalyticsConsentGranted()) {
      return false;
    }

    if (
      !shouldEnableYandexMetrika({
        pathname,
        hostname: window.location.hostname,
      })
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function initYandexMetrika(counterId: number, pathname?: string | null): void {
  if (!canUseYandexMetrika(pathname)) {
    return;
  }

  if (initializedCounterId === counterId) {
    return;
  }

  window.ym!(counterId, "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });

  setupYandexMetrikaPrivacyMasking();
  initializedCounterId = counterId;
}

export function reachYandexMetrikaHit(
  pathname: string,
  searchParams?: URLSearchParams | string | null,
): void {
  const counterId = getYandexMetrikaCounterId();

  if (!counterId || !canUseYandexMetrika(pathname)) {
    return;
  }

  const url = sanitizeMetrikaPageUrl(pathname, searchParams);

  try {
    window.ym!(counterId, "hit", url, {
      title: document.title,
    });
  } catch {
    // Analytics must not break UX
  }
}

export function sendYandexGoal(
  goalName: string,
  params?: YandexMetrikaGoalParams | Record<string, unknown> | null,
): void {
  if (!isYandexMetrikaGoalName(goalName)) {
    return;
  }

  const counterId = getYandexMetrikaCounterId();

  if (!counterId || !canUseYandexMetrika()) {
    return;
  }

  const sanitizedParams = sanitizeYandexMetrikaGoalParams(params);
  const inferredSource = inferRetentionMetrikaSource(goalName);

  if (inferredSource && !sanitizedParams.source) {
    sanitizedParams.source = inferredSource;
  }

  try {
    if (Object.keys(sanitizedParams).length === 0) {
      window.ym!(counterId, "reachGoal", goalName);
      return;
    }

    window.ym!(counterId, "reachGoal", goalName, sanitizedParams);
  } catch {
    // Analytics must not break UX
  }
}

export function reachYandexMetrikaGoal(eventName: PlatformAnalyticsEventName): void {
  sendYandexGoal(eventName);
}

export function resetYandexMetrikaForTests(): void {
  initializedCounterId = null;
}

declare global {
  interface Window {
    ym?: (counterId: number, method: string, ...args: unknown[]) => void;
  }
}

export {};
