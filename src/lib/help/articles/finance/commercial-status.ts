import type { HelpArticle } from "@/lib/help/types";

export const commercialStatusArticle: HelpArticle = {
  id: "help.finance.commercial-status",
  slug: "commercial-status",
  title: "Как получить коммерческий статус автора",
  description:
    "Подайте заявку на коммерческое подключение, примите условия и заполните реквизиты для выплат.",
  category: "finance",
  audience: "author",
  order: 10,
  keywords: [
    "коммерческий автор",
    "коммерческий статус",
    "заявка",
    "условия для авторов",
    "платные продукты",
    "продажи",
    "авторское вознаграждение",
  ],
  updatedAt: "2026-07-29",
  version: 1,
  relatedRoutes: [
    "/author-dashboard/status",
    "/author-dashboard/commercial-application",
    "/author-dashboard/commercial/terms",
    "/author-terms",
  ],
  relatedArticleIds: [
    "help.finance.earnings-and-payouts",
    "help.authors.publish-product",
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
        "Откройте раздел статуса автора (/author-dashboard/status).",
        "Подайте заявку на коммерческое подключение — кнопка ведёт на форму заявки (/author-dashboard/commercial-application).",
        "Дождитесь одобрения заявки. Статус отображается на странице статуса.",
        "Примите условия для авторов — документ доступен на /author-terms и в кабинете (/author-dashboard/commercial/terms).",
        "При необходимости заполните «Данные для выплат» (/author-dashboard/commercial/payout-details).",
        "После активации коммерческого статуса можно создавать платные продукты и принимать оплату.",
      ],
    },
    {
      id: "notes",
      title: "Важно",
      notes: [
        "Реквизиты можно заполнить позже — до первой выплаты.",
        "Заполнить реквизиты может только владелец авторского пространства.",
        "При приостановке коммерции бесплатные материалы и страница автора остаются доступны.",
        "Доля авторского вознаграждения и условия платформы указаны на странице статуса.",
      ],
    },
  ],
  cta: {
    label: "Открыть статус автора",
    href: "/author-dashboard/status",
  },
};
