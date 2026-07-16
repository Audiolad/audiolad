"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import {
  getPersonalGreetingAtIndex,
  getPersonalHomeVisitContentFromStorage,
  getPersonalHomeWisdomAtIndex,
  type PersonalHomeVisitContent,
} from "@/lib/home/personal-greeting";

type DailyGreetingProps = {
  firstName: string | null;
};

type DailyGreetingContent = {
  greetingTitle: string;
  wisdomPhrase: string;
};

function getFallbackContent(firstName: string | null): DailyGreetingContent {
  return {
    greetingTitle: getPersonalGreetingAtIndex(0, firstName),
    wisdomPhrase: getPersonalHomeWisdomAtIndex(0),
  };
}

function usePersonalHomeVisitContent(
  firstName: string | null,
): DailyGreetingContent {
  const visitRef = useRef<{
    ready: boolean;
    content: PersonalHomeVisitContent | null;
  }>({
    ready: false,
    content: null,
  });

  const getFallback = useCallback(
    () => getFallbackContent(firstName),
    [firstName],
  );

  return useSyncExternalStore(
    (onStoreChange) => {
      queueMicrotask(() => {
        visitRef.current = {
          ready: true,
          content: getPersonalHomeVisitContentFromStorage(
            window.localStorage,
            firstName,
          ),
        };
        onStoreChange();
      });

      return () => {
        visitRef.current = {
          ready: false,
          content: null,
        };
      };
    },
    () => {
      if (!visitRef.current.ready || !visitRef.current.content) {
        return getFallback();
      }

      return {
        greetingTitle: visitRef.current.content.greetingTitle,
        wisdomPhrase: visitRef.current.content.wisdomPhrase,
      };
    },
    getFallback,
  );
}

export default function DailyGreeting({ firstName }: DailyGreetingProps) {
  const { greetingTitle, wisdomPhrase } = usePersonalHomeVisitContent(firstName);

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
