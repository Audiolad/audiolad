import {
  getPersonalGreetingAtIndex,
  getPersonalHomeVisitContentFromStorage,
  getPersonalHomeWisdomAtIndex,
} from "./personal-greeting";

export type DailyGreetingContent = {
  greetingTitle: string;
  wisdomPhrase: string;
};

export function createDailyGreetingFallback(
  firstName: string | null,
): DailyGreetingContent {
  return {
    greetingTitle: getPersonalGreetingAtIndex(0, firstName),
    wisdomPhrase: getPersonalHomeWisdomAtIndex(0),
  };
}

export function readDailyGreetingVisitContent(
  firstName: string | null,
): DailyGreetingContent {
  const visit = getPersonalHomeVisitContentFromStorage(
    window.localStorage,
    firstName,
  );

  return {
    greetingTitle: visit.greetingTitle,
    wisdomPhrase: visit.wisdomPhrase,
  };
}

export function shouldUpdateDailyGreetingContent(
  previous: DailyGreetingContent,
  next: DailyGreetingContent,
): boolean {
  return (
    previous.greetingTitle !== next.greetingTitle ||
    previous.wisdomPhrase !== next.wisdomPhrase
  );
}
