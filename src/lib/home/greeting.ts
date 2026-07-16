export type DayPeriod = "morning" | "day" | "evening" | "night";

export const TIME_OF_DAY_SECTION_TITLES: Record<DayPeriod, string> = {
  morning: "Мягкое начало дня",
  day: "Небольшая пауза для себя",
  evening: "Время замедлиться",
  night: "Для спокойного завершения дня",
};

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

export function getTimeOfDaySectionTitle(period: DayPeriod): string {
  return TIME_OF_DAY_SECTION_TITLES[period];
}
