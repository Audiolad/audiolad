import { GREETING_PHRASES_BY_PERIOD } from "./greeting-phrases";

export type DayPeriod = "morning" | "day" | "evening" | "night";

export type GreetingLabel =
  | "Доброе утро"
  | "Добрый день"
  | "Добрый вечер"
  | "Доброй ночи";

const PERIOD_GREETINGS: Record<DayPeriod, GreetingLabel> = {
  morning: "Доброе утро",
  day: "Добрый день",
  evening: "Добрый вечер",
  night: "Доброй ночи",
};

export const TIME_OF_DAY_SECTION_TITLES: Record<DayPeriod, string> = {
  morning: "Мягкое начало дня",
  day: "Небольшая пауза для себя",
  evening: "Время замедлиться",
  night: "Для спокойного завершения дня",
};

function stableHash(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getDayPeriodFromHour(hour: number): DayPeriod {
  if (hour >= 5 && hour < 12) {
    return "morning";
  }

  if (hour >= 12 && hour < 18) {
    return "day";
  }

  if (hour >= 18 && hour < 23) {
    return "evening";
  }

  return "night";
}

export function getGreetingLabel(period: DayPeriod): GreetingLabel {
  return PERIOD_GREETINGS[period];
}

export function selectEditorialPhrase(period: DayPeriod, date: Date): string {
  const phrases = GREETING_PHRASES_BY_PERIOD[period];
  const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const index = stableHash(`${dateKey}:${period}`) % phrases.length;

  return phrases[index];
}

export function getTimeOfDaySectionTitle(period: DayPeriod): string {
  return TIME_OF_DAY_SECTION_TITLES[period];
}

export type PersonalGreetingContent = {
  greetingTitle: string;
  greetingPhrase: string;
  timeOfDaySectionTitle: string;
};

function buildGreetingTitle(
  greetingLabel: GreetingLabel,
  firstName: string | null,
): string {
  if (!firstName) {
    return greetingLabel;
  }

  return `${greetingLabel}, ${firstName}! 💜`;
}

export function buildPersonalGreetingContent(
  firstName: string | null,
  date = new Date(),
): PersonalGreetingContent {
  const period = getDayPeriodFromHour(date.getHours());
  const greetingLabel = getGreetingLabel(period);

  return {
    greetingTitle: buildGreetingTitle(greetingLabel, firstName),
    greetingPhrase: selectEditorialPhrase(period, date),
    timeOfDaySectionTitle: getTimeOfDaySectionTitle(period),
  };
}
