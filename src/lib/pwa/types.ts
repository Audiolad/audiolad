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

export type PwaInstallDialogMode =
  | "ios"
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
  remindLater: () => void;
  openInstallFlow: (source: "banner" | "menu") => Promise<void>;
  openMenuInstall: () => void;
  closeDialog: () => void;
  dismissBannerForSession: () => void;
};
