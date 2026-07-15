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

const MORNING_PHRASES = [
  "Новый день можно начать не со спешки, а с внимания к себе.",
  "Пусть сегодня найдётся время для того, что наполняет вас силами.",
  "Утро – хорошее время для одного спокойного шага к себе.",
  "Можно начать день мягко, без лишней суеты и ожиданий.",
  "Пусть первые минуты дня будут немного тише обычного.",
  "Сегодня достаточно одного небольшого момента для себя.",
  "Утро не требует сразу всего – можно выбрать одно важное.",
  "Пусть день начнётся с чего-то простого и поддерживающего.",
  "Есть пространство начать день в своём ритме.",
  "Можно позволить себе немного тишины перед делами.",
  "Пусть утро станет временем, когда вы чуть ближе к себе.",
  "Новый день – это возможность выбрать то, что вам откликается.",
] as const;

const DAY_PHRASES = [
  "Среди важных дел оставьте немного пространства для себя.",
  "Не обязательно делать всё сразу. Выберите один следующий шаг.",
  "Можно сделать паузу – даже короткая помогает собраться.",
  "Середина дня – хорошее время для небольшой передышки.",
  "Пусть найдётся несколько минут только для вас.",
  "Иногда достаточно одного спокойного момента посреди дня.",
  "Можно замедлиться ненадолго и вернуть внимание к себе.",
  "День не обязан быть идеальным, чтобы в нём было место для себя.",
  "Пусть сегодня будет хотя бы один тихий момент.",
  "Можно выбрать то, что сейчас действительно поддерживает.",
  "Среди дел важно оставить немного пространства для себя.",
  "Небольшая пауза – это тоже забота о себе.",
] as const;

const EVENING_PHRASES = [
  "Пусть вечер станет временем возвращения к себе.",
  "Можно ненадолго остановиться и отпустить напряжение дня.",
  "Вечер – подходящее время замедлиться и выдохнуть.",
  "Пусть последние часы дня будут чуть мягче.",
  "Можно отпустить суету и позволить себе немного тишины.",
  "Вечером хорошо выбрать что-то спокойное и простое.",
  "Пусть этот вечер будет без лишних требований к себе.",
  "Можно завершить день с чем-то, что помогает расслабиться.",
  "Вечер – время вернуться к себе, пусть ненадолго.",
  "Пусть напряжение дня постепенно отступает.",
  "Можно позволить себе замедлиться перед отдыхом.",
  "Вечером достаточно одного спокойного момента для себя.",
] as const;

const NIGHT_PHRASES = [
  "Этой ночью не нужно ничего решать. Можно просто побыть в тишине.",
  "Пусть несколько спокойных минут помогут мягко завершить день.",
  "Ночь – время отпустить дела и позволить себе отдых.",
  "Можно не торопиться – ночь для того, чтобы замедлиться.",
  "Пусть перед сном найдётся место для чего-то тихого.",
  "Не нужно ничего успевать – можно просто выдохнуть.",
  "Ночь подходит для спокойного завершения дня.",
  "Пусть последние минуты дня будут без спешки.",
  "Можно позволить себе немного тишины перед сном.",
  "Ночью хорошо выбрать что-то мягкое и ненавязчивое.",
  "Пусть этот вечер завершится спокойно и без давления.",
  "Можно отпустить день и остаться с собой в тишине.",
] as const;

const PHRASES_BY_PERIOD: Record<DayPeriod, readonly string[]> = {
  morning: MORNING_PHRASES,
  day: DAY_PHRASES,
  evening: EVENING_PHRASES,
  night: NIGHT_PHRASES,
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
  const phrases = PHRASES_BY_PERIOD[period];
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

export function buildPersonalGreetingContent(
  firstName: string | null,
  date = new Date(),
): PersonalGreetingContent {
  const period = getDayPeriodFromHour(date.getHours());
  const greetingLabel = getGreetingLabel(period);
  const greetingTitle = firstName
    ? `${greetingLabel}, ${firstName}`
    : greetingLabel;

  return {
    greetingTitle,
    greetingPhrase: selectEditorialPhrase(period, date),
    timeOfDaySectionTitle: getTimeOfDaySectionTitle(period),
  };
}
