/**
 * MAX Mini App Bridge helpers.
 *
 * Official 2026 docs: https://dev.max.ru/docs/webapps/bridge
 * CDN: https://st.max.ru/js/max-web-app.js
 *
 * `window.WebApp` is created on launch and does not need a separate init
 * call. Presence of `WebApp` after the CDN script loads is NOT proof the
 * page is inside MAX. Prefer non-empty `initData` or hash launch params
 * (`WebAppData` / `WebAppPlatform` / `WebAppVersion`).
 *
 * Never trust `initDataUnsafe` for security decisions. This module does not
 * validate `initData` and must never contain a messenger secret.
 */

export const MAX_WEB_APP_SCRIPT_SRC = "https://st.max.ru/js/max-web-app.js";

export type MaxBridgeSnapshot = {
  inMax: boolean;
  platform: string | null;
  version: string | null;
};

type MaxWebAppLike = {
  initData?: unknown;
  platform?: unknown;
  version?: unknown;
};

const EMPTY_SNAPSHOT: MaxBridgeSnapshot = {
  inMax: false,
  platform: null,
  version: null,
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readHashParams(hash: string): URLSearchParams {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

export function hashIndicatesMaxLaunch(hash: string): boolean {
  const params = readHashParams(hash);
  return Boolean(
    asNonEmptyString(params.get("WebAppData")) ||
      asNonEmptyString(params.get("WebAppPlatform")) ||
      asNonEmptyString(params.get("WebAppVersion")),
  );
}

export function getWindowWebApp(): MaxWebAppLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  const webApp = window.WebApp;
  if (!webApp || typeof webApp !== "object") {
    return null;
  }

  return webApp;
}

export function resolveMaxBridgeSnapshot(input: {
  webApp?: MaxWebAppLike | null;
  hash?: string;
}): MaxBridgeSnapshot {
  const webApp = input.webApp ?? null;
  const hash = input.hash ?? "";
  const initData = asNonEmptyString(webApp?.initData);
  const inMax = Boolean(initData) || hashIndicatesMaxLaunch(hash);

  return {
    inMax,
    platform: asNonEmptyString(webApp?.platform),
    version: asNonEmptyString(webApp?.version),
  };
}

export function readMaxBridgeSnapshot(): MaxBridgeSnapshot {
  try {
    if (typeof window === "undefined") {
      return EMPTY_SNAPSHOT;
    }

    return resolveMaxBridgeSnapshot({
      webApp: getWindowWebApp(),
      hash: window.location.hash,
    });
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

declare global {
  interface Window {
    WebApp?: MaxWebAppLike;
  }
}
