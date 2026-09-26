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

export function buildBusinessGreetingSubtitle(
  state: "healthy" | "autonomous" | "stopped",
): string {
  if (state === "healthy") {
    return "Всё отлично. Музыка играет как запланировано.";
  }
  if (state === "autonomous") {
    return "Интернет временно недоступен. Точка работает автономно.";
  }
  return "Нужно внимание: плеер в точке не отвечает.";
}
