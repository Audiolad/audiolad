import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const authorStatsArticle: HelpArticle = {
  id: "help.promotion.author-stats",
  slug: "author-stats",
  title: "Как смотреть статистику автора",
  description:
    "Откройте статистику кабинета автора и проверьте просмотры, сохранения и результаты кампаний.",
  category: "promotion",
  audience: "author",
  order: 30,
  keywords: [
    "статистика",
    "аналитика автора",
    "просмотры",
    "кампания",
    "utm",
    "результаты продвижения",
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: ["/author-dashboard/stats", "/author-dashboard/promotion"],
  relatedArticleIds: [
    "help.promotion.create-campaign",
    "help.promotion.create-promo-page",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Статистика показывает, как слушатели находят и сохраняют ваши материалы, а также как работают рекламные кампании.",
      ],
    },
    {
      id: "steps",
      title: "Где смотреть показатели",
      steps: [
        helpRich(
          "Откройте кабинет автора → «Продвижение» или перейдите в ",
          helpPublicLink("/author-dashboard/stats"),
          ".",
        ),
        "Просмотрите общие показатели: просмотры, добавления в Аудиотеку и связанные события.",
        "Откройте нужную кампанию, чтобы увидеть блок «Статистика кампании».",
        "Сверьте UTM-метки и источники переходов, если запускали рекламу.",
      ],
      notes: [
        "Если по кампании ещё нет promo-событий с UTM-метками, блок статистики может быть пустым — это нормально на старте.",
        "Сначала опубликуйте продукт и запустите продвижение, затем возвращайтесь к цифрам.",
      ],
    },
  ],
  cta: {
    label: "Открыть статистику",
    href: "/author-dashboard/stats",
  },
};
