import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const createPromoPageArticle: HelpArticle = {
  id: "help.promotion.create-promo-page",
  slug: "create-promo-page",
  title: "Как создать промостраницу",
  description:
    "Соберите промостраницу для продукта, опубликуйте её и используйте ссылку в рекламе и соцсетях.",
  category: "promotion",
  audience: "author",
  order: 10,
  keywords: [
    "промостраница",
    "создать промостраницу",
    "опубликовать промо",
    "продвижение",
    "лендинг",
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: ["/author-dashboard/promotion"],
  relatedArticleIds: [
    "help.promotion.create-campaign",
    "help.promotion.author-stats",
    "help.authors.publish-product",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Промостраница — отдельная посадочная страница для знакомства с вашим продуктом. Она создаётся в разделе «Продвижение».",
      ],
    },
    {
      id: "steps",
      title: "Как создать и опубликовать",
      steps: [
        helpRich(
          "Откройте кабинет автора → «Продвижение» (",
          helpPublicLink("/author-dashboard/promotion"),
          ").",
        ),
        "Нажмите «Создать промостраницу».",
        "Заполните содержимое и привяжите продукт.",
        "Нажмите «Создать черновик» или «Сохранить черновик».",
        "Когда страница готова, нажмите «Опубликовать».",
      ],
      notes: [
        "После публикации промостраницу можно снова снять с публикации для правок.",
        "Для рекламы удобно сочетать промостраницу с кампанией и UTM-ссылками.",
      ],
    },
  ],
  cta: {
    label: "Открыть продвижение",
    href: "/author-dashboard/promotion",
  },
};
