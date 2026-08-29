import type {
  WordstatOpportunity,
  WordstatOpportunityColor,
  WordstatOpportunityLevel,
} from "@/lib/seo/wordstat/types";

const OPPORTUNITY_COPY: Record<
  WordstatOpportunityLevel,
  { label: string; description: string; color: WordstatOpportunityColor }
> = {
  green: {
    color: "green",
    label: "Хороший диапазон для старта",
    description:
      "Есть поисковый спрос, а запрос достаточно конкретный.",
  },
  yellow_low: {
    color: "yellow",
    label: "Очень узкий запрос",
    description:
      "Запрос очень конкретный, но поискового спроса немного.",
  },
  yellow_high: {
    color: "yellow",
    label: "Высокий спрос",
    description:
      "Запрос интересный, но попасть высоко в поиске может быть сложнее.",
  },
  red_low: {
    color: "red",
    label: "Очень мало запросов",
    description:
      "Для основного запроса лучше поискать более востребованный вариант.",
  },
  red_high: {
    color: "red",
    label: "Очень широкий запрос",
    description:
      "Для нового продукта лучше поискать более конкретную формулировку.",
  },
};

export function wordstatOpportunityLevel(
  count: number,
): WordstatOpportunityLevel {
  if (!Number.isFinite(count) || count < 0) {
    return "red_low";
  }

  if (count <= 9) {
    return "red_low";
  }

  if (count <= 49) {
    return "yellow_low";
  }

  if (count <= 1000) {
    return "green";
  }

  if (count <= 5000) {
    return "yellow_high";
  }

  return "red_high";
}

/**
 * UX heuristic for 30-day Wordstat demand. Not a ranking guarantee.
 * Thresholds live only here — do not copy them into JSX.
 */
export function evaluateWordstatOpportunity(count: number): WordstatOpportunity {
  const level = wordstatOpportunityLevel(count);
  const copy = OPPORTUNITY_COPY[level];

  return {
    level,
    color: copy.color,
    label: copy.label,
    description: copy.description,
  };
}

export function wordstatOpportunityLegendLabel(
  color: WordstatOpportunityColor,
): string {
  if (color === "green") {
    return "подходит для старта";
  }

  if (color === "yellow") {
    return "стоит оценить внимательнее";
  }

  return "лучше поискать другой вариант";
}
