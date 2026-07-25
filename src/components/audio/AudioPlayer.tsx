"use client";

/**
 * Legacy entry kept for import stability.
 * Listen page uses ListenPlayerProvider + mobile/desktop views.
 */
export {
  ListenPlayerProvider,
  type ListenPlayerProps,
} from "@/components/audio/listen-player-shared";
export { default as ListenPlayerMobile } from "@/components/audio/ListenPlayerMobile";
export { default as ListenPlayerDesktop } from "@/components/audio/ListenPlayerDesktop";
