"use client";

import { useSyncExternalStore } from "react";

import {
  detectPwaPlatform,
  isInAppBrowser,
  isStandaloneMode,
  resolveInstallCapability,
  resolveUiVariant,
  type PwaInstallCapability,
} from "@/lib/pwa/platform";
import type { PwaPlatform } from "@/lib/pwa/constants";

export type PwaBrowserEnvironment = {
  userAgent: string;
  platform: PwaPlatform;
  isStandalone: boolean;
  uiVariant: ReturnType<typeof resolveUiVariant>;
  isInApp: boolean;
};

const SERVER_SNAPSHOT: PwaBrowserEnvironment = {
  userAgent: "",
  platform: "unknown",
  isStandalone: false,
  uiVariant: "mobile",
  isInApp: false,
};

let cachedClientSnapshot: PwaBrowserEnvironment | null = null;

export function browserEnvironmentEquals(
  left: PwaBrowserEnvironment,
  right: PwaBrowserEnvironment,
): boolean {
  return (
    left.userAgent === right.userAgent &&
    left.platform === right.platform &&
    left.isStandalone === right.isStandalone &&
    left.uiVariant === right.uiVariant &&
    left.isInApp === right.isInApp
  );
}

export function createBrowserEnvironmentSnapshot(
  userAgent: string,
): PwaBrowserEnvironment {
  return {
    userAgent,
    platform: detectPwaPlatform(userAgent),
    isStandalone: isStandaloneMode(),
    uiVariant: resolveUiVariant(userAgent),
    isInApp: isInAppBrowser(userAgent),
  };
}

function readBrowserEnvironment(): PwaBrowserEnvironment {
  if (typeof window === "undefined") {
    return SERVER_SNAPSHOT;
  }

  const next = createBrowserEnvironmentSnapshot(navigator.userAgent);

  if (cachedClientSnapshot && browserEnvironmentEquals(cachedClientSnapshot, next)) {
    return cachedClientSnapshot;
  }

  cachedClientSnapshot = next;
  return cachedClientSnapshot;
}

function subscribeToBrowserEnvironment(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const media = window.matchMedia("(display-mode: standalone)");

  const handleChange = () => {
    cachedClientSnapshot = null;
    onStoreChange();
  };

  media.addEventListener("change", handleChange);
  window.addEventListener("appinstalled", handleChange);

  return () => {
    media.removeEventListener("change", handleChange);
    window.removeEventListener("appinstalled", handleChange);
  };
}

export function usePwaBrowserEnvironment(): PwaBrowserEnvironment {
  return useSyncExternalStore(
    subscribeToBrowserEnvironment,
    readBrowserEnvironment,
    () => SERVER_SNAPSHOT,
  );
}

export function resolveInstallCapabilityForEnvironment(
  environment: PwaBrowserEnvironment,
  hasDeferredPrompt: boolean,
): PwaInstallCapability {
  return resolveInstallCapability({
    userAgent: environment.userAgent,
    hasDeferredPrompt,
  });
}
