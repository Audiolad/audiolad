export type BusinessDayPart = "morning" | "day" | "evening" | "night";

export function getBusinessDayPart(date: Date = new Date()): BusinessDayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "day";
  if (hour >= 17 && hour < 23) return "evening";
  return "night";
}

export function buildBusinessGreeting(
  firstName: string,
  date: Date = new Date(),
): string {
  const part = getBusinessDayPart(date);
  const prefix =
    part === "morning"
      ? "Доброе утро"
      : part === "day"
        ? "Добрый день"
        : part === "evening"
          ? "Добрый вечер"
          : "Доброй ночи";
  return `${prefix}, ${firstName}!`;
}

export function buildBusinessGreetingSubtitle(): string {
  return "Состояние вашей точки и последние данные.";
}
