import type { PwaInstallContextValue } from "@/lib/pwa/types";
import { setInstallDialogMode } from "@/lib/pwa/install-dialog-controller";

const noop = () => {};
const noopAsync = async () => {};

/**
 * Safe PWA context used when the install provider subtree fails.
 * Must not touch browser APIs or trigger side effects.
 */
export const PWA_INSTALL_FALLBACK_CONTEXT: PwaInstallContextValue = {
  installState: "unsupported",
  isStandalone: false,
  isAuthenticated: false,
  canShowBanner: false,
  uiVariant: "desktop",
  dialogMode: null,
  isBannerVisible: false,
  isMenuDialogOpen: false,
  hasNativeInstallPrompt: false,
  remindLater: noop,
  openInstallFlow: noopAsync,
  openMenuInstall: noop,
  runNativeInstallFromDialog: noopAsync,
  closeDialog: () => {
    setInstallDialogMode(null);
  },
  dismissBannerForSession: noop,
};
