"use client";

import { useMemo, useRef, useSyncExternalStore } from "react";

import {
  getPersonalGreetingAtIndex,
  getPersonalHomeVisitContentFromStorage,
  getPersonalHomeWisdomAtIndex,
} from "@/lib/home/personal-greeting";

type DailyGreetingProps = {
  firstName: string | null;
};

type DailyGreetingContent = {
  greetingTitle: string;
  wisdomPhrase: string;
};

function createFallbackContent(firstName: string | null): DailyGreetingContent {
  return {
    greetingTitle: getPersonalGreetingAtIndex(0, firstName),
    wisdomPhrase: getPersonalHomeWisdomAtIndex(0),
  };
}

function readVisitContent(firstName: string | null): DailyGreetingContent {
  const visit = getPersonalHomeVisitContentFromStorage(
    window.localStorage,
    firstName,
  );

  return {
    greetingTitle: visit.greetingTitle,
    wisdomPhrase: visit.wisdomPhrase,
  };
}

function usePersonalHomeVisitContent(
  firstName: string | null,
): DailyGreetingContent {
  const serverSnapshot = useMemo(
    () => createFallbackContent(firstName),
    [firstName],
  );
  const clientSnapshotRef = useRef(serverSnapshot);

  return useSyncExternalStore(
    (onStoreChange) => {
      queueMicrotask(() => {
        clientSnapshotRef.current = readVisitContent(firstName);
        onStoreChange();
      });

      return () => {
        clientSnapshotRef.current = serverSnapshot;
      };
    },
    () => clientSnapshotRef.current,
    () => serverSnapshot,
  );
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
