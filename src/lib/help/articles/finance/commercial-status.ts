import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const commercialStatusArticle: HelpArticle = {
  id: "help.finance.commercial-status",
  slug: "commercial-status",
  title: "Как получить коммерческий статус",
  description:
    "Подайте заявку на коммерческое подключение, примите условия автора и подготовьте данные для выплат.",
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
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: [
    "/author-dashboard/status",
    "/author-dashboard/commercial-application",
    "/author-dashboard/commercial/terms",
    "/author-terms",
  ],
  relatedArticleIds: [
    "help.finance.earnings-and-payouts",
    "help.authors.create-first-product",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Коммерческий статус нужен, чтобы продавать аудиопродукты и получать авторское вознаграждение. На стартовом статусе доступны бесплатные публикации, промостраницы и личные материалы.",
      ],
    },
    {
      id: "steps",
      title: "Как подключить коммерцию",
      steps: [
        helpRich(
          "Откройте раздел статуса автора (",
          helpPublicLink("/author-dashboard/status"),
          ").",
        ),
        helpRich(
          "Подайте заявку на коммерческое подключение — кнопка ведёт на форму заявки (",
          helpPublicLink("/author-dashboard/commercial-application"),
          ").",
        ),
        "Дождитесь рассмотрения заявки администрацией АудиоЛада.",
        helpRich(
          "Примите условия для авторов — документ доступен на ",
          helpPublicLink("/author-terms"),
          " и в кабинете (",
          helpPublicLink("/author-dashboard/commercial/terms"),
          ").",
        ),
        helpRich(
          "При необходимости заполните «Данные для выплат» (",
          helpPublicLink("/author-dashboard/commercial/payout-details"),
          ").",
        ),
      ],
      notes: [
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
