import type { HelpArticle } from "@/lib/help/types";

export const earningsAndPayoutsArticle: HelpArticle = {
  id: "help.finance.earnings-and-payouts",
  slug: "earnings-and-payouts",
  title: "Как смотреть начисления и выплаты",
  description:
    "Проверяйте продажи, авторское вознаграждение и статус выплат в разделе финансов кабинета автора.",
  category: "finance",
  audience: "author",
  order: 20,
  keywords: [
    "выплаты",
    "вознаграждение",
    "начисления",
    "финансы",
    "продажи",
    "реквизиты",
    "доход",
  ],
  updatedAt: "2026-07-29",
  version: 1,
  relatedRoutes: [
    "/author-dashboard/finance",
    "/author-dashboard/commercial/payout-details",
  ],
  relatedArticleIds: [
    "help.finance.commercial-status",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Раздел «Финансы» показывает продажи, начисленное авторское вознаграждение и историю выплат. Доступен авторам с активным коммерческим статусом.",
      ],
    },
    {
      id: "steps",
      title: "Как проверить финансы",
      steps: [
        "Откройте кабинет автора → «Финансы» (/author-dashboard/finance).",
        "Просмотрите сводку по продажам и начислениям за выбранный период.",
        "Проверьте статус выплат и ожидаемые суммы.",
        "Если реквизиты ещё не заполнены, перейдите в «Данные для выплат» (/author-dashboard/commercial/payout-details).",
        "Заполните или обновите реквизиты и отправьте на проверку.",
      ],
    },
    {
      id: "notes",
      title: "Ограничения",
      notes: [
        "Финансовая статистика доступна после активации коммерческого статуса.",
        "Выплата возможна только при проверенных реквизитах.",
        "Если реквизиты отправлены на проверку, редактирование временно недоступно — дождитесь результата или комментария модератора.",
        "Редактор авторского пространства не может менять реквизиты — это делает владелец кабинета.",
      ],
    },
  ],
  cta: {
    label: "Перейти к финансам",
    href: "/author-dashboard/finance",
  },
};
