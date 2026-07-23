/** Non-standard BeforeInstallPromptEvent (Chromium). */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type PwaInstallUiVariant = "mobile" | "desktop";

export type PwaInstallFlowSource = "banner" | "menu" | "retention";

export type PwaInstallDialogMode =
  | "ios"
  | "android"
  | "desktop_chrome"
  | "desktop_edge"
  | "desktop_safari"
  | "desktop_bookmark"
  | "installed"
  | "unsupported"
  | "in_app_browser";

export type PwaSyncAction = "installed" | "standalone_open";

export type PwaSyncBody = {
  action?: unknown;
  platform?: unknown;
};

export type PwaInstallContextValue = {
  installState: import("@/lib/pwa/constants").PwaInstallState;
  isStandalone: boolean;
  isAuthenticated: boolean;
  canShowBanner: boolean;
  uiVariant: PwaInstallUiVariant;
  dialogMode: PwaInstallDialogMode | null;
  isBannerVisible: boolean;
  isMenuDialogOpen: boolean;
  hasNativeInstallPrompt: boolean;
  remindLater: () => void;
  openInstallFlow: (source: PwaInstallFlowSource) => Promise<void>;
  openMenuInstall: () => void;
  runNativeInstallFromDialog: () => Promise<void>;
  closeDialog: () => void;
  dismissBannerForSession: () => void;
};
