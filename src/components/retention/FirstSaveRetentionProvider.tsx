"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import FirstSaveRetentionCard from "@/components/retention/FirstSaveRetentionCard";

type FirstSaveRetentionContextValue = {
  showFirstSaveRetention: (input: { practiceId: string }) => void;
  visiblePracticeId: string | null;
  dismiss: () => void;
};

const FirstSaveRetentionContext =
  createContext<FirstSaveRetentionContextValue | null>(null);

export function useFirstSaveRetention(): FirstSaveRetentionContextValue {
  const context = useContext(FirstSaveRetentionContext);

  if (!context) {
    throw new Error(
      "useFirstSaveRetention must be used within FirstSaveRetentionProvider",
    );
  }

  return context;
}

type FirstSaveRetentionProviderProps = {
  children: ReactNode;
};

export default function FirstSaveRetentionProvider({
  children,
}: FirstSaveRetentionProviderProps) {
  const [visiblePracticeId, setVisiblePracticeId] = useState<string | null>(
    null,
  );

  const dismiss = useCallback(() => {
    setVisiblePracticeId(null);
  }, []);

  const showFirstSaveRetention = useCallback(
    ({ practiceId }: { practiceId: string }) => {
      setVisiblePracticeId(practiceId);
    },
    [],
  );

  const value = useMemo(
    () => ({
      showFirstSaveRetention,
      visiblePracticeId,
      dismiss,
    }),
    [showFirstSaveRetention, visiblePracticeId, dismiss],
  );

  return (
    <FirstSaveRetentionContext.Provider value={value}>
      {children}
    </FirstSaveRetentionContext.Provider>
  );
}

/** Renders retention card inside a tree that may provide PWA install context. */
export function FirstSaveRetentionHost() {
  const context = useContext(FirstSaveRetentionContext);

  if (!context?.visiblePracticeId) {
    return null;
  }

  return (
    <FirstSaveRetentionCard
      practiceId={context.visiblePracticeId}
      onDismiss={context.dismiss}
    />
  );
}
