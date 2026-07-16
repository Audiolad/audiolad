import type { HistoryPeriod } from "./types";

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

const dayMonthFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});

export function formatHistoryActivityLabel(
  isoDate: string,
  now: Date = new Date(),
): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );
  const time = timeFormatter.format(date);

  if (diffDays === 0) {
    return `Сегодня, ${time}`;
  }

  if (diffDays === 1) {
    return `Вчера, ${time}`;
  }

  return `${dayMonthFormatter.format(date)}, ${time}`;
}

export function getCompletedStatusLabel(): string {
  return "Завершено";
}

export function getHistoryFilterLabels(): Array<{
  filter: "all" | "in-progress" | "completed";
  label: string;
}> {
  return [
    { filter: "all", label: "Все" },
    { filter: "in-progress", label: "В процессе" },
    { filter: "completed", label: "Завершённые" },
  ];
}

export function getHistoryEmptyState(filter: "all" | "in-progress" | "completed"): {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
} {
  if (filter === "in-progress") {
    return {
      title: "Нет незавершённых практик",
      description: "Все начатые материалы уже завершены.",
      ctaLabel: "Перейти в аудиотеку",
      ctaHref: "/my-practices",
    };
  }

  if (filter === "completed") {
    return {
      title: "Пока ничего не завершено",
      description: "Продолжайте слушать — завершённые практики появятся здесь.",
      ctaLabel: "Открыть аудиотеку",
      ctaHref: "/my-practices",
    };
  }

  return {
    title: "История пока пуста",
    description:
      "Здесь появятся практики и программы, которые вы начнёте слушать.",
    ctaLabel: "Выбрать практику",
    ctaHref: "/catalog",
  };
}

export const HISTORY_PERIOD_ORDER: HistoryPeriod[] = [
  "today",
  "yesterday",
  "this-week",
  "earlier",
];
