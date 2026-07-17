import type { ReactNode } from "react";

type ListenerAppShellProps = {
  children: ReactNode;
};

/**
 * Future desktop listener shell (sidebar, main, now playing, top bar, player).
 * Stage 1: passive passthrough — not mounted in the app tree yet.
 */
export function ListenerAppShell({ children }: ListenerAppShellProps) {
  return children;
}
