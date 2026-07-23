"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import PwaInstallBanner from "@/components/pwa/PwaInstallBanner";
import PwaInstallDialog from "@/components/pwa/PwaInstallDialog";
import { trackPwaEventOnce } from "@/lib/pwa/analytics-client";
import {
  PWA_REMIND_LATER_MS,
  type PwaInstallState,
} from "@/lib/pwa/constants";
import {
  resolveInstallCapabilityForEnvironment,
  usePwaBrowserEnvironment,
} from "@/lib/pwa/browser-environment";
import {
  isValueMomentRoute,
  resolveInstallDialogMode,
} from "@/lib/pwa/platform";
import {
  getInstallDialogMode,
  setInstallDialogMode,
  subscribeInstallDialogMode,
} from "@/lib/pwa/install-dialog-controller";
import { registerPwaServiceWorker, syncPwaProfileState } from "@/lib/pwa/register-sw";
import { shouldShowPwaBanner } from "@/lib/pwa/state-machine";
import {
  confirmPwaInstalled,
  incrementPwaVisitCount,
  markPwaBannerShownThisSession,
  markPwaValueMoment,
  patchPwaDeviceState,
  recordPwaPromptAccepted,
  recordPwaStandaloneOpen,
  resolveEffectiveInstallState,
  setPwaDismissedUntil,
} from "@/lib/pwa/storage";
import type {
  BeforeInstallPromptEvent,
  PwaInstallContextValue,
  PwaInstallDialogMode,
  PwaInstallFlowSource,
} from "@/lib/pwa/types";
import {
  usePwaBannerShownThisSession,
  usePwaDeviceLocalState,
  usePwaValueMomentReached,
} from "@/lib/pwa/use-pwa-storage";
import { createClient } from "@/lib/supabase/client";

export const PwaInstallContext = createContext<PwaInstallContextValue | null>(
  null,
);

export function usePwaInstall(): PwaInstallContextValue {
  const context = useContext(PwaInstallContext);

  if (!context) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider");
  }

  return context;
}

const NATIVE_PROMPT_TIMEOUT_MS = 4_000;

function useInstallDialogMode(): PwaInstallDialogMode | null {
  return useSyncExternalStore(
    subscribeInstallDialogMode,
    getInstallDialogMode,
    () => null,
  );
}

type PwaInstallProviderProps = {
  children: ReactNode;
};

export default function PwaInstallProvider({ children }: PwaInstallProviderProps) {
  const pathname = usePathname() ?? "/";
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const analyticsSessionRef = useRef("pwa-session");
  const installSourceRef = useRef<PwaInstallFlowSource>("banner");
  const standaloneTrackedRef = useRef(false);
  const bannerAnalyticsTrackedRef = useRef(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState(false);
  const dialogMode = useInstallDialogMode();
  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
  const [sessionHiddenBanner, setSessionHiddenBanner] = useState(false);

  const localState = usePwaDeviceLocalState();
  const hasValueMoment = usePwaValueMomentReached();
  const bannerShownThisSession = usePwaBannerShownThisSession();
  const browserEnvironment = usePwaBrowserEnvironment();

  const { platform, isStandalone, uiVariant, isInApp } = browserEnvironment;
  const installCapability = resolveInstallCapabilityForEnvironment(
    browserEnvironment,
    hasDeferredPrompt,
  );

  const installState: PwaInstallState = resolveEffectiveInstallState({
    localState,
    isStandalone,
    installCapability,
  });

  const canShowBanner = shouldShowPwaBanner({
    isAuthenticated,
    isAuthReady,
    pathname,
    isStandalone,
    hasValueMoment,
    installState,
    installCapability,
    bannerShownThisSession: bannerShownThisSession || sessionHiddenBanner,
    dismissedUntil: localState.dismissedUntil,
    promptAcceptedAt: localState.promptAcceptedAt,
  });

  const isBannerVisible = canShowBanner && dialogMode === null && !isMenuDialogOpen;

  useEffect(() => {
    analyticsSessionRef.current = `pwa-${Math.random().toString(36).slice(2, 10)}`;
    registerPwaServiceWorker();
    incrementPwaVisitCount();
  }, []);

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(Boolean(data.session?.user));
      setIsAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
      setIsAuthReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isValueMomentRoute(pathname)) {
      markPwaValueMoment();
    }
  }, [pathname]);

  useEffect(() => {
    if (!isStandalone || standaloneTrackedRef.current) {
      return;
    }

    standaloneTrackedRef.current = true;
    recordPwaStandaloneOpen();

    trackPwaEventOnce(
      `${analyticsSessionRef.current}:standalone`,
      "pwa_opened_standalone",
      { platform },
    );

    void syncPwaProfileState({ action: "standalone_open", platform });
  }, [isStandalone, platform]);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setHasDeferredPrompt(true);
      patchPwaDeviceState({ status: "prompt_available" });
    }

    function onAppInstalled() {
      confirmPwaInstalled(platform);
      setHasDeferredPrompt(false);
      deferredPromptRef.current = null;
      setInstallDialogMode(null);
      setIsMenuDialogOpen(false);

      trackPwaEventOnce(
        `${analyticsSessionRef.current}:installed`,
        "pwa_installed",
        { platform },
      );

      void syncPwaProfileState({ action: "installed", platform });
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [platform]);

  useEffect(() => {
    if (!isBannerVisible || bannerAnalyticsTrackedRef.current) {
      return;
    }

    bannerAnalyticsTrackedRef.current = true;
    markPwaBannerShownThisSession();

    trackPwaEventOnce(
      `${analyticsSessionRef.current}:banner-shown`,
      "pwa_banner_shown",
      { platform },
    );
  }, [isBannerVisible, platform]);

  const closeDialog = useCallback(() => {
    setInstallDialogMode(null);
    setIsMenuDialogOpen(false);
  }, []);

  const dismissBannerForSession = useCallback(() => {
    setSessionHiddenBanner(true);
  }, []);

  const remindLater = useCallback(() => {
    const until = Date.now() + PWA_REMIND_LATER_MS;
    setPwaDismissedUntil(until);
    setSessionHiddenBanner(true);

    trackPwaEventOnce(
      `${analyticsSessionRef.current}:remind-later`,
      "pwa_remind_later_clicked",
      { platform },
    );
  }, [platform]);

  const openInstructions = useCallback(
    (mode: PwaInstallDialogMode, source: PwaInstallFlowSource) => {
      installSourceRef.current = source;
      setInstallDialogMode(mode);
      setIsMenuDialogOpen(source === "menu");

      if (
        mode === "ios" ||
        mode === "android" ||
        mode === "in_app_browser" ||
        mode.startsWith("desktop_")
      ) {
        queueMicrotask(() => {
          trackPwaEventOnce(
            `${analyticsSessionRef.current}:instructions:${mode}:${source}`,
            mode === "ios"
              ? "pwa_ios_instructions_opened"
              : "pwa_install_clicked",
            { platform, source },
          );
        });

        if (source === "banner") {
          dismissBannerForSession();
        }
      }
    },
    [dismissBannerForSession, platform],
  );

  const openInstructionFallback = useCallback(
    (source: PwaInstallFlowSource) => {
      openInstructions(
        resolveInstallDialogMode({
          userAgent: browserEnvironment.userAgent,
          platform,
          isInApp,
        }),
        source,
      );
    },
    [browserEnvironment.userAgent, isInApp, openInstructions, platform],
  );

  const runNativeInstallFromDialog = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;

    if (!promptEvent) {
      return;
    }

    const source = installSourceRef.current;

    trackPwaEventOnce(
      `${analyticsSessionRef.current}:install-click:${source}`,
      "pwa_install_clicked",
      { platform, source },
    );

    const promptPromise = promptEvent.prompt();
    let timedOut = false;
    let timeoutId = 0;

    try {
      await Promise.race([
        promptPromise,
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            timedOut = true;
            reject(new Error("pwa_prompt_timeout"));
          }, NATIVE_PROMPT_TIMEOUT_MS);
        }),
      ]);

      window.clearTimeout(timeoutId);

      trackPwaEventOnce(
        `${analyticsSessionRef.current}:prompt-shown:${source}`,
        "pwa_install_prompt_shown",
        { platform, source },
      );
    } catch {
      window.clearTimeout(timeoutId);

      if (!timedOut) {
        deferredPromptRef.current = null;
        setHasDeferredPrompt(false);
      }

      return;
    }

    let choice: Awaited<BeforeInstallPromptEvent["userChoice"]>;

    try {
      choice = await promptEvent.userChoice;
    } catch {
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      return;
    }

    deferredPromptRef.current = null;
    setHasDeferredPrompt(false);

    if (choice.outcome === "accepted") {
      recordPwaPromptAccepted();
      setSessionHiddenBanner(true);

      trackPwaEventOnce(
        `${analyticsSessionRef.current}:accepted:${source}`,
        "pwa_install_accepted",
        { platform, source },
      );
      return;
    }

    trackPwaEventOnce(
      `${analyticsSessionRef.current}:dismissed:${source}`,
      "pwa_install_dismissed",
      { platform, source },
    );
  }, [platform]);

  function canAutoRunNativeInstall(mode: PwaInstallDialogMode): boolean {
    return (
      mode === "android" ||
      mode === "desktop_chrome" ||
      mode === "desktop_edge"
    );
  }

  const openInstallFlow = useCallback(
    async (source: PwaInstallFlowSource) => {
      if (isStandalone) {
        return;
      }

      openInstructionFallback(source);

      if (source !== "retention" || !hasDeferredPrompt) {
        return;
      }

      const mode = getInstallDialogMode();

      if (!mode || !canAutoRunNativeInstall(mode)) {
        return;
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      await runNativeInstallFromDialog();
    },
    [hasDeferredPrompt, isStandalone, openInstructionFallback, runNativeInstallFromDialog],
  );

  const openMenuInstall = useCallback(() => {
    void openInstallFlow("menu");
  }, [openInstallFlow]);

  const contextValue = useMemo<PwaInstallContextValue>(
    () => ({
      installState,
      isStandalone,
      isAuthenticated,
      canShowBanner,
      uiVariant,
      dialogMode,
      isBannerVisible,
      isMenuDialogOpen,
      hasNativeInstallPrompt: hasDeferredPrompt,
      remindLater,
      openInstallFlow,
      openMenuInstall,
      runNativeInstallFromDialog,
      closeDialog,
      dismissBannerForSession,
    }),
    [
      canShowBanner,
      closeDialog,
      dialogMode,
      dismissBannerForSession,
      hasDeferredPrompt,
      installState,
      isAuthenticated,
      isBannerVisible,
      isMenuDialogOpen,
      isStandalone,
      openInstallFlow,
      openMenuInstall,
      remindLater,
      runNativeInstallFromDialog,
      uiVariant,
    ],
  );

  return (
    <PwaInstallContext.Provider value={contextValue}>
      {children}
      <PwaInstallBanner />
      <PwaInstallDialog />
    </PwaInstallContext.Provider>
  );
}
