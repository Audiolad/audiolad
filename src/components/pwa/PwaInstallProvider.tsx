"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  detectPwaPlatform,
  isInAppBrowser,
  isStandaloneMode,
  isValueMomentRoute,
  resolveInstallCapability,
  resolveUiVariant,
} from "@/lib/pwa/platform";
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
} from "@/lib/pwa/types";
import {
  usePwaBannerShownThisSession,
  usePwaDeviceLocalState,
  usePwaValueMomentReached,
} from "@/lib/pwa/use-pwa-storage";
import { createClient } from "@/lib/supabase/client";

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function usePwaInstall(): PwaInstallContextValue {
  const context = useContext(PwaInstallContext);

  if (!context) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider");
  }

  return context;
}

type PwaInstallProviderProps = {
  children: ReactNode;
};

export default function PwaInstallProvider({ children }: PwaInstallProviderProps) {
  const pathname = usePathname() ?? "/";
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const analyticsSessionRef = useRef("pwa-session");
  const standaloneTrackedRef = useRef(false);
  const bannerAnalyticsTrackedRef = useRef(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState(false);
  const [dialogMode, setDialogMode] = useState<PwaInstallDialogMode | null>(
    null,
  );
  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
  const [sessionHiddenBanner, setSessionHiddenBanner] = useState(false);

  const localState = usePwaDeviceLocalState();
  const hasValueMoment = usePwaValueMomentReached();
  const bannerShownThisSession = usePwaBannerShownThisSession();

  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : "";
  const platform = detectPwaPlatform(userAgent);
  const isStandalone = isStandaloneMode();
  const uiVariant = resolveUiVariant(userAgent);
  const isInApp = isInAppBrowser(userAgent);
  const installCapability = resolveInstallCapability({
    userAgent,
    hasDeferredPrompt,
  });

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
    setDialogMode(null);
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
    (mode: PwaInstallDialogMode, source: "banner" | "menu") => {
      setDialogMode(mode);
      setIsMenuDialogOpen(source === "menu");

      if (mode === "ios") {
        trackPwaEventOnce(
          `${analyticsSessionRef.current}:ios-instructions:${source}`,
          "pwa_ios_instructions_opened",
          { platform, source },
        );

        if (source === "banner") {
          dismissBannerForSession();
        }
      }
    },
    [dismissBannerForSession, platform],
  );

  const runNativeInstallPrompt = useCallback(
    async (source: "banner" | "menu") => {
      const promptEvent = deferredPromptRef.current;

      if (!promptEvent) {
        if (platform === "ios") {
          openInstructions("ios", source);
        } else if (uiVariant === "desktop") {
          openInstructions("desktop_bookmark", source);
        }
        return;
      }

      trackPwaEventOnce(
        `${analyticsSessionRef.current}:install-click:${source}`,
        "pwa_install_clicked",
        { platform, source },
      );

      trackPwaEventOnce(
        `${analyticsSessionRef.current}:prompt-shown:${source}`,
        "pwa_install_prompt_shown",
        { platform, source },
      );

      await promptEvent.prompt();

      const choice = await promptEvent.userChoice;

      if (choice.outcome === "accepted") {
        recordPwaPromptAccepted();
        setSessionHiddenBanner(true);

        trackPwaEventOnce(
          `${analyticsSessionRef.current}:accepted:${source}`,
          "pwa_install_accepted",
          { platform, source },
        );
      } else {
        trackPwaEventOnce(
          `${analyticsSessionRef.current}:dismissed:${source}`,
          "pwa_install_dismissed",
          { platform, source },
        );
      }

      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
    },
    [openInstructions, platform, uiVariant],
  );

  const openInstallFlow = useCallback(
    async (source: "banner" | "menu") => {
      if (installState === "installed_confirmed" || isStandalone) {
        openInstructions("installed", source);
        return;
      }

      if (installCapability === "instructions_only") {
        if (isInApp) {
          openInstructions("in_app_browser", source);
        } else {
          openInstructions(platform === "ios" ? "ios" : "desktop_bookmark", source);
        }
        return;
      }

      await runNativeInstallPrompt(source);
    },
    [
      installCapability,
      installState,
      isInApp,
      isStandalone,
      openInstructions,
      platform,
      runNativeInstallPrompt,
    ],
  );

  const openMenuInstall = useCallback(() => {
    if (installState === "installed_confirmed" || isStandalone) {
      openInstructions("installed", "menu");
      return;
    }

    if (installCapability === "unsupported") {
      openInstructions("unsupported", "menu");
      return;
    }

    void openInstallFlow("menu");
  }, [installCapability, installState, isStandalone, openInstallFlow, openInstructions]);

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
      remindLater,
      openInstallFlow,
      openMenuInstall,
      closeDialog,
      dismissBannerForSession,
    }),
    [
      canShowBanner,
      closeDialog,
      dialogMode,
      dismissBannerForSession,
      installState,
      isAuthenticated,
      isBannerVisible,
      isMenuDialogOpen,
      isStandalone,
      openInstallFlow,
      openMenuInstall,
      remindLater,
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
