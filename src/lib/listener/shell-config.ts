import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

export type ListenerShellMode = "default" | "profile" | "author";

export type ListenerShellConfig = {
  mode: ListenerShellMode;
  showDesktopSidebar: boolean;
  showRightColumn: boolean;
  showDesktopPlayerBar: boolean;
  showDesktopSearch: boolean;
  showMobileBottomNav: boolean;
  bodyClassName: string;
  centerColumnClassName: string;
};

const DEFAULT_BODY_CLASS = platformMobileShellClass;

export const LISTENER_SHELL_CONFIGS: Record<
  ListenerShellMode,
  ListenerShellConfig
> = {
  default: {
    mode: "default",
    showDesktopSidebar: true,
    showRightColumn: true,
    showDesktopPlayerBar: true,
    showDesktopSearch: true,
    showMobileBottomNav: true,
    bodyClassName: DEFAULT_BODY_CLASS,
    centerColumnClassName: "",
  },
  profile: {
    mode: "profile",
    showDesktopSidebar: true,
    showRightColumn: false,
    showDesktopPlayerBar: true,
    showDesktopSearch: true,
    showMobileBottomNav: true,
    bodyClassName: DEFAULT_BODY_CLASS,
    centerColumnClassName: "listener-profile-content",
  },
  author: {
    mode: "author",
    showDesktopSidebar: true,
    showRightColumn: false,
    showDesktopPlayerBar: true,
    showDesktopSearch: true,
    showMobileBottomNav: true,
    bodyClassName: DEFAULT_BODY_CLASS,
    centerColumnClassName: "listener-author-content",
  },
};

export function resolveListenerShellConfig(
  mode: ListenerShellMode = "default",
): ListenerShellConfig {
  return LISTENER_SHELL_CONFIGS[mode];
}
