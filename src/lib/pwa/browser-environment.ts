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

function readBrowserEnvironment(): PwaBrowserEnvironment {
  if (typeof window === "undefined") {
    return SERVER_SNAPSHOT;
  }

  const userAgent = navigator.userAgent;

  return {
    userAgent,
    platform: detectPwaPlatform(userAgent),
    isStandalone: isStandaloneMode(),
    uiVariant: resolveUiVariant(userAgent),
    isInApp: isInAppBrowser(userAgent),
  };
}

function subscribeToBrowserEnvironment(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const media = window.matchMedia("(display-mode: standalone)");

  const handleChange = () => {
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
