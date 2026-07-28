import type { AuthorStatsChartMetric, AuthorStatsSourceBucket } from "./types";

export const AUTHOR_STATS_SECTION_TITLE = "Статистика";

export const AUTHOR_STATS_SECTION_SUBTITLE =
  "Посещения, прослушивания и действия аудитории на ваших страницах";

export const AUTHOR_STATS_PROMOTION_LINK_LABEL =
  "Подробная статистика рекламных кампаний – в разделе «Продвижение»";

export const AUTHOR_STATS_METHOD_NOTES = [
  "Статистика агрегирована: конкретные посетители и их персональные данные не показываются.",
  "Уникальный посетитель определяется по техническому идентификатору браузера или аккаунту.",
  "Один человек на разных устройствах или после очистки данных может учитываться несколько раз.",
  "Статистика страницы автора собирается с даты запуска этого раздела.",
  "Показатели могут отличаться от Яндекс.Метрики из-за другой методики.",
] as const;

export const AUTHOR_STATS_SOURCE_LABELS: Record<AuthorStatsSourceBucket, string> =
  {
    direct: "Прямые переходы",
    internal: "Внутри АудиоЛада",
    telegram: "Telegram",
    vk: "VK",
    max: "MAX",
    search: "Поиск",
    other_external: "Другие внешние",
    unknown: "Не определено",
  };

export const AUTHOR_STATS_CHART_METRIC_LABELS: Record<
  AuthorStatsChartMetric,
  string
> = {
  practice_views: "Просмотры продуктов",
  practice_unique_visitors: "Посетители продуктов",
  plays: "Запуски",
  completions: "Завершения",
  library_saves: "Сохранения",
  paid_purchases: "Покупки",
  author_page_views: "Просмотры страницы автора",
  author_page_unique_visitors: "Посетители страницы автора",
};

export function formatAuthorStatsCount(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function formatAuthorStatsRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })}%`;
}

export function formatAuthorStatsProductStatus(status: string): string {
  switch (status) {
    case "published":
      return "Опубликован";
    case "draft":
      return "Черновик";
    case "archived":
      return "В архиве";
    case "unpublished":
      return "Снят с публикации";
    default:
      return status;
  }
}
