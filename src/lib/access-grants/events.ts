/**
 * Analytics for the shared business trial (task 1e008ee8).
 * Stored in access_grant_events. Not platform_analytics events and not mailings.
 * subscription_go_to_payment may repeat; every other name is recorded once per email.
 */

export const ACCESS_GRANT_EVENTS = [
  "trial_started",
  "first_useful_action",
  "activity_day_7",
  "activity_day_14",
  "activity_day_30",
  "subscription_offer_shown",
  "subscription_go_to_payment",
  "subscription_renewed",
] as const;

export type AccessGrantEventName = (typeof ACCESS_GRANT_EVENTS)[number];

const EVENT_SET = new Set<string>(ACCESS_GRANT_EVENTS);

export function isAccessGrantEventName(value: string): value is AccessGrantEventName {
  return EVENT_SET.has(value);
}

/** Once-only events. A repeated go-to-payment click is a new row. */
export function accessGrantEventIsUnique(name: AccessGrantEventName): boolean {
  return name !== "subscription_go_to_payment";
}

const ACTIVITY_DAYS = [
  { day: 7, name: "activity_day_7" },
  { day: 14, name: "activity_day_14" },
  { day: 30, name: "activity_day_30" },
] as const;

export type AccessActivityAction = "visit" | "play" | "offer_click" | "renewal";

/**
 * Which events this action should append.
 * `calendarDayIndex` is 0 on the activation calendar day (Europe/Moscow).
 * Day 7 is index >= 6. Activity is recorded only while the trial player is still open.
 */
export function eventsForAccessAction(input: {
  action: AccessActivityAction;
  mode: "trial" | "paid" | "offer" | "none";
  calendarDayIndex: number | null;
  recorded: readonly AccessGrantEventName[];
}): AccessGrantEventName[] {
  const have = new Set(input.recorded);
  const out: AccessGrantEventName[] = [];
  const push = (name: AccessGrantEventName) => {
    if (accessGrantEventIsUnique(name) && have.has(name)) return;
    out.push(name);
  };

  if (input.action === "renewal") {
    push("subscription_renewed");
    return out;
  }

  if (input.action === "offer_click") {
    push("subscription_go_to_payment");
    return out;
  }

  if (input.action === "play" && (input.mode === "trial" || input.mode === "paid")) {
    push("first_useful_action");
  }

  if (input.action === "visit" && input.mode === "trial" && input.calendarDayIndex !== null) {
    for (const milestone of ACTIVITY_DAYS) {
      if (input.calendarDayIndex >= milestone.day - 1) push(milestone.name);
    }
  }

  if (input.action === "visit" && input.mode === "offer") {
    push("subscription_offer_shown");
  }

  return out;
}
