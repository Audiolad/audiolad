import type { MaxPrimaryTab } from "@/lib/max/primary-tabs";
import { vkLaunchTargetToken, type VkLaunchTarget } from "@/lib/vk/launch-target";

export type VkDetailOrigin = "home" | "catalog" | "deeplink";

/**
 * Plain launch stays on Home. A product hash opens inside Catalog
 * and does not leave the mini app.
 */
export function resolveVkShellLaunch(launch: VkLaunchTarget | null): {
  tab: MaxPrimaryTab;
  productToken: string | null;
} {
  if (!launch) {
    return { tab: "home", productToken: null };
  }

  return { tab: "catalog", productToken: vkLaunchTargetToken(launch) };
}

/** Leaving a tab, or tapping the current tab, closes product detail in place. */
export function vkTabSelectionAfterSelect(input: {
  activeTab: MaxPrimaryTab;
  nextTab: MaxPrimaryTab;
  hasProductDetail: boolean;
}): { tab: MaxPrimaryTab; closeProductDetail: boolean } {
  if (input.nextTab === input.activeTab) {
    return {
      tab: input.activeTab,
      closeProductDetail:
        input.hasProductDetail &&
        (input.nextTab === "catalog" || input.nextTab === "home"),
    };
  }

  return {
    tab: input.nextTab,
    closeProductDetail: input.hasProductDetail,
  };
}

/** Detail back stays inside VK: home returns home, everything else returns catalog. */
export function vkDetailBackTarget(origin: VkDetailOrigin): MaxPrimaryTab {
  return origin === "home" ? "home" : "catalog";
}
