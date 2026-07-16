"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import {
  createDailyGreetingFallback,
  readDailyGreetingVisitContent,
  shouldUpdateDailyGreetingContent,
  type DailyGreetingContent,
} from "@/lib/home/daily-greeting-display";

type DailyGreetingProps = {
  firstName: string | null;
};

function usePersonalHomeVisitContent(
  firstName: string | null,
): DailyGreetingContent {
  const serverSnapshot = useMemo(
    () => createDailyGreetingFallback(firstName),
    [firstName],
  );
  const clientSnapshotRef = useRef(serverSnapshot);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      queueMicrotask(() => {
        let next: DailyGreetingContent;

        try {
          next = readDailyGreetingVisitContent(firstName);
        } catch {
          return;
        }

        if (
          !shouldUpdateDailyGreetingContent(clientSnapshotRef.current, next)
        ) {
          return;
        }

        clientSnapshotRef.current = next;
        onStoreChange();
      });

      return () => {
        clientSnapshotRef.current = serverSnapshot;
      };
    },
    [firstName, serverSnapshot],
  );

  const getSnapshot = useCallback(() => clientSnapshotRef.current, []);
  const getServerSnapshot = useCallback(
    () => serverSnapshot,
    [serverSnapshot],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function DailyGreeting({ firstName }: DailyGreetingProps) {
  const { greetingTitle, wisdomPhrase } =
    usePersonalHomeVisitContent(firstName);

  return (
    <section
      className="mt-6 rounded-[24px] border border-[#eadff8] bg-gradient-to-r from-[#faf4ff] to-[#f5edfc] px-5 py-4"
      aria-label="Персональное приветствие"
    >
      <h1 className="text-[22px] font-semibold leading-tight text-[#25135c] lg:text-[24px]">
        {greetingTitle}
      </h1>
      <p className="mt-2 min-h-[3rem] text-[15px] leading-6 text-[#6f61a3] sm:min-h-[4.5rem]">
        <em>{wisdomPhrase}</em>
      </p>
    </section>
  );
}
