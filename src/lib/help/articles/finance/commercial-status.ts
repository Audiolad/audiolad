import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const commercialStatusArticle: HelpArticle = {
  id: "help.finance.commercial-status",
  slug: "commercial-status",
  title: "Как получить коммерческий статус",
  description:
    "Сначала опубликуйте бесплатный продукт, затем подайте заявку на коммерческое подключение, примите условия автора и при необходимости подготовьте данные для выплат.",
  category: "finance",
  audience: "author",
  order: 10,
  keywords: [
    "коммерческий автор",
    "коммерческий статус",
    "заявка",
    "условия автора",
    "выплаты",
    "авторское вознаграждение",
    "бесплатный продукт",
  ],
  updatedAt: "2026-08-04",
  version: 3,
  relatedRoutes: [
    "/author-dashboard/status",
    "/author-dashboard/commercial-application",
    "/author-dashboard/commercial/terms",
    "/author-terms",
    "/author-dashboard/products/new",
  ],
  relatedArticleIds: [
    "help.finance.earnings-and-payouts",
    "help.authors.create-first-product",
    "help.authors.publish-product",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Коммерческий статус нужен, чтобы продавать аудиопродукты и получать авторское вознаграждение. На стартовом статусе доступны бесплатные публикации, промостраницы и личные материалы.",
        "Подать заявку на коммерческий статус можно только после публикации хотя бы одного бесплатного продукта в текущем авторском проекте. Подходит бесплатная практика, бесплатная музыка или бесплатный альбом.",
      ],
    },
    {
      id: "steps",
      title: "Как подключить коммерцию",
      steps: [
        helpRich(
          "Создайте бесплатный продукт в кабинете автора (",
          helpPublicLink("/author-dashboard/products/new"),
          ").",
        ),
        "Отправьте продукт на модерацию и дождитесь одобрения.",
        "После публикации бесплатного продукта откройте раздел статуса автора и подайте заявку на коммерческое подключение.",
        "Дождитесь рассмотрения заявки администрацией АудиоЛада.",
        helpRich(
          "Примите условия для авторов — документ доступен на ",
          helpPublicLink("/author-terms"),
          " и в кабинете (",
          helpPublicLink("/author-dashboard/commercial/terms"),
          ").",
        ),
        "После коммерческого одобрения и принятия условий можно публиковать платные продукты.",
        helpRich(
          "При необходимости заполните «Данные для выплат» (",
          helpPublicLink("/author-dashboard/commercial/payout-details"),
          ").",
        ),
      ],
      notes: [
        "Черновик коммерческой заявки можно заполнять заранее, но отправить её получится только после публикации бесплатного продукта.",
        "Реквизиты можно заполнить позже — до первой выплаты.",
        "Пока заявка на рассмотрении или требуется доработка, статус и доступные действия отображаются на странице статуса автора.",
      ],
    },
  ],
  cta: {
    label: "Открыть статус автора",
    href: "/author-dashboard/status",
  },
};
