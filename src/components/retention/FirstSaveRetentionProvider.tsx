"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import FirstSaveRetentionCard from "@/components/retention/FirstSaveRetentionCard";

type FirstSaveRetentionContextValue = {
  showFirstSaveRetention: (input: { practiceId: string }) => void;
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
  const router = useRouter();
  const [visiblePracticeId, setVisiblePracticeId] = useState<string | null>(
    null,
  );

  const dismiss = useCallback(() => {
    setVisiblePracticeId(null);
    router.refresh();
  }, [router]);

  const showFirstSaveRetention = useCallback(
    ({ practiceId }: { practiceId: string }) => {
      setVisiblePracticeId(practiceId);
    },
    [],
  );

  const value = useMemo(
    () => ({
      showFirstSaveRetention,
    }),
    [showFirstSaveRetention],
  );

  return (
    <FirstSaveRetentionContext.Provider value={value}>
      {children}
      {visiblePracticeId ? (
        <FirstSaveRetentionCard
          practiceId={visiblePracticeId}
          onDismiss={dismiss}
        />
      ) : null}
    </FirstSaveRetentionContext.Provider>
  );
}
