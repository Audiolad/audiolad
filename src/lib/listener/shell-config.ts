import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

export type ListenerShellMode = "default" | "profile" | "author" | "listen";

export type ListenerShellConfig = {
  mode: ListenerShellMode;
  showDesktopSidebar: boolean;
  showRightColumn: boolean;
  showDesktopPlayerBar: boolean;
  showDesktopSearch: boolean;
  showMobileBottomNav: boolean;
  showRightColumnPlaybackControls: boolean;
  bodyClassName: string;
  centerColumnClassName: string;
};

const DEFAULT_BODY_CLASS = platformMobileShellClass;

const AUTHOR_MOBILE_BODY_CLASS = [
  platformMobileShellClass,
  "listener-app-shell__body--no-mobile-bottom-nav",
].join(" ");

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
    showRightColumnPlaybackControls: true,
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
    showRightColumnPlaybackControls: true,
    bodyClassName: DEFAULT_BODY_CLASS,
    centerColumnClassName: "listener-profile-content",
  },
  author: {
    mode: "author",
    showDesktopSidebar: true,
    showRightColumn: false,
    showDesktopPlayerBar: false,
    showDesktopSearch: true,
    showMobileBottomNav: false,
    showRightColumnPlaybackControls: true,
    bodyClassName: AUTHOR_MOBILE_BODY_CLASS,
    centerColumnClassName: "listener-author-content",
  },
  listen: {
    mode: "listen",
    showDesktopSidebar: true,
    showRightColumn: true,
    showDesktopPlayerBar: false,
    showDesktopSearch: true,
    showMobileBottomNav: false,
    showRightColumnPlaybackControls: false,
    bodyClassName: DEFAULT_BODY_CLASS,
    centerColumnClassName: "listener-listen-content",
  },
};

export function resolveListenerShellConfig(
  mode: ListenerShellMode = "default",
): ListenerShellConfig {
  return LISTENER_SHELL_CONFIGS[mode];
}
