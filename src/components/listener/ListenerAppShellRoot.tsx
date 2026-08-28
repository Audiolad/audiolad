"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  writeListenerSidebarPinnedCookie,
  type ListenerSidebarPinnedState,
} from "@/lib/navigation/listener-sidebar";

type ListenerSidebarPinnedContextValue = {
  pinned: ListenerSidebarPinnedState;
  setPinned: (next: ListenerSidebarPinnedState) => void;
};

const ListenerSidebarPinnedContext =
  createContext<ListenerSidebarPinnedContextValue | null>(null);

type ListenerAppShellRootProps = {
  children: ReactNode;
  className: string;
  initialSidebarPinned: ListenerSidebarPinnedState;
};

export function ListenerAppShellRoot({
  children,
  className,
  initialSidebarPinned,
}: ListenerAppShellRootProps) {
  const [pinned, setPinnedState] = useState(initialSidebarPinned);

  const setPinned = useCallback((next: ListenerSidebarPinnedState) => {
    setPinnedState(next);
    writeListenerSidebarPinnedCookie(next);
  }, []);

  const value = useMemo(
    () => ({ pinned, setPinned }),
    [pinned, setPinned],
  );

  return (
    <ListenerSidebarPinnedContext.Provider value={value}>
      <div className={className} data-sidebar-pinned={pinned}>
        {children}
      </div>
    </ListenerSidebarPinnedContext.Provider>
  );
}

export function useListenerSidebarPinned() {
  const context = useContext(ListenerSidebarPinnedContext);
  if (!context) {
    throw new Error(
      "useListenerSidebarPinned must be used within ListenerAppShellRoot",
    );
  }
  return context;
}
