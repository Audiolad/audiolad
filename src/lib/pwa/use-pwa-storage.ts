"use client";

import { useSyncExternalStore } from "react";

import { PWA_DEFAULT_DEVICE_STATE } from "@/lib/pwa/constants";
import {
  hasPwaValueMoment,
  isPwaBannerShownThisSession,
  readPwaDeviceState,
  subscribePwaStorage,
} from "@/lib/pwa/storage";

export function usePwaDeviceLocalState() {
  return useSyncExternalStore(
    subscribePwaStorage,
    readPwaDeviceState,
    () => PWA_DEFAULT_DEVICE_STATE,
  );
}

export function usePwaValueMomentReached() {
  return useSyncExternalStore(
    subscribePwaStorage,
    hasPwaValueMoment,
    () => false,
  );
}

export function usePwaBannerShownThisSession() {
  return useSyncExternalStore(
    subscribePwaStorage,
    isPwaBannerShownThisSession,
    () => false,
  );
}
