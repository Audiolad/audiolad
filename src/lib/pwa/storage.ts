import {
  PWA_DEFAULT_DEVICE_STATE,
  PWA_INSTALL_STATES,
  PWA_LOCAL_STORAGE_KEYS,
  PWA_PLATFORM_VALUES,
  type PwaDeviceLocalState,
  type PwaInstallState,
  type PwaPlatform,
} from "@/lib/pwa/constants";

const pwaStorageListeners = new Set<() => void>();

export function subscribePwaStorage(listener: () => void): () => void {
  pwaStorageListeners.add(listener);

  return () => {
    pwaStorageListeners.delete(listener);
  };
}

export function notifyPwaStorageChange(): void {
  for (const listener of pwaStorageListeners) {
    listener();
  }
}

function readJson<T>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable
  }
}

export function readPwaDeviceState(): PwaDeviceLocalState {
  if (typeof window === "undefined") {
    return PWA_DEFAULT_DEVICE_STATE;
  }

  const parsed = readJson<PwaDeviceLocalState>(
    window.localStorage.getItem(PWA_LOCAL_STORAGE_KEYS.deviceState),
  );

  if (!parsed || typeof parsed !== "object") {
    return PWA_DEFAULT_DEVICE_STATE;
  }

  const status = PWA_INSTALL_STATES.includes(parsed.status as PwaInstallState)
    ? (parsed.status as PwaInstallState)
    : "eligible";

  const installPlatform =
    parsed.installPlatform &&
    PWA_PLATFORM_VALUES.includes(parsed.installPlatform as PwaPlatform)
      ? (parsed.installPlatform as PwaPlatform)
      : null;

  return {
    status,
    dismissedUntil:
      typeof parsed.dismissedUntil === "number" ? parsed.dismissedUntil : null,
    installedAt:
      typeof parsed.installedAt === "number" ? parsed.installedAt : null,
    installPlatform,
    lastStandaloneOpenedAt:
      typeof parsed.lastStandaloneOpenedAt === "number"
        ? parsed.lastStandaloneOpenedAt
        : null,
    promptAcceptedAt:
      typeof parsed.promptAcceptedAt === "number"
        ? parsed.promptAcceptedAt
        : null,
  };
}

export function writePwaDeviceState(state: PwaDeviceLocalState): void {
  if (typeof window === "undefined") {
    return;
  }

  writeJson(PWA_LOCAL_STORAGE_KEYS.deviceState, state);
  notifyPwaStorageChange();
}

export function patchPwaDeviceState(
  patch: Partial<PwaDeviceLocalState>,
): PwaDeviceLocalState {
  const next = { ...readPwaDeviceState(), ...patch };
  writePwaDeviceState(next);
  return next;
}

export function markPwaValueMoment(now = Date.now()): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const existing = window.localStorage.getItem(
      PWA_LOCAL_STORAGE_KEYS.valueMomentAt,
    );

    if (!existing) {
      window.localStorage.setItem(
        PWA_LOCAL_STORAGE_KEYS.valueMomentAt,
        String(now),
      );
      notifyPwaStorageChange();
    }
  } catch {
    // ignore
  }
}

export function hasPwaValueMoment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return Boolean(
      window.localStorage.getItem(PWA_LOCAL_STORAGE_KEYS.valueMomentAt),
    );
  } catch {
    return false;
  }
}

export function incrementPwaVisitCount(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    const raw = window.localStorage.getItem(PWA_LOCAL_STORAGE_KEYS.visitCount);
    const next = (raw ? Number.parseInt(raw, 10) : 0) + 1;

    if (!Number.isFinite(next)) {
      return 1;
    }

    window.localStorage.setItem(
      PWA_LOCAL_STORAGE_KEYS.visitCount,
      String(next),
    );

    if (next >= 2) {
      markPwaValueMoment();
    }

    return next;
  } catch {
    return 0;
  }
}

export function isPwaBannerShownThisSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const sessionId = window.sessionStorage.getItem("audiolad_tab_session_id");

    if (!sessionId) {
      return false;
    }

    return (
      window.sessionStorage.getItem(PWA_LOCAL_STORAGE_KEYS.sessionBannerShown) ===
      sessionId
    );
  } catch {
    return false;
  }
}

export function markPwaBannerShownThisSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const sessionId =
      window.sessionStorage.getItem("audiolad_tab_session_id") ??
      `session-${Date.now()}`;

    window.sessionStorage.setItem("audiolad_tab_session_id", sessionId);
    window.sessionStorage.setItem(
      PWA_LOCAL_STORAGE_KEYS.sessionBannerShown,
      sessionId,
    );
    notifyPwaStorageChange();
  } catch {
    // ignore
  }
}

export function setPwaDismissedUntil(until: number): PwaDeviceLocalState {
  return patchPwaDeviceState({
    status: "dismissed",
    dismissedUntil: until,
  });
}

export function recordPwaPromptAccepted(now = Date.now()): PwaDeviceLocalState {
  return patchPwaDeviceState({
    promptAcceptedAt: now,
  });
}

export function confirmPwaInstalled(
  platform: PwaPlatform,
  now = Date.now(),
): PwaDeviceLocalState {
  return patchPwaDeviceState({
    status: "installed_confirmed",
    installedAt: now,
    installPlatform: platform,
    dismissedUntil: null,
    promptAcceptedAt: null,
  });
}

export function recordPwaStandaloneOpen(now = Date.now()): PwaDeviceLocalState {
  return patchPwaDeviceState({
    status: "installed_confirmed",
    lastStandaloneOpenedAt: now,
  });
}

export function resolveEffectiveInstallState(input: {
  localState: PwaDeviceLocalState;
  isStandalone: boolean;
  installCapability: import("@/lib/pwa/platform").PwaInstallCapability;
  now?: number;
}): PwaInstallState {
  const now = input.now ?? Date.now();

  if (input.isStandalone || input.localState.status === "installed_confirmed") {
    return "installed_confirmed";
  }

  if (input.localState.status === "dismissed") {
    if (input.localState.dismissedUntil && input.localState.dismissedUntil > now) {
      return "dismissed";
    }
  }

  if (input.installCapability === "prompt_available") {
    return "prompt_available";
  }

  if (input.installCapability === "instructions_only") {
    return "instructions_only";
  }

  if (input.installCapability === "unsupported") {
    return "unsupported";
  }

  return input.localState.status === "dismissed" ? "eligible" : input.localState.status;
}
