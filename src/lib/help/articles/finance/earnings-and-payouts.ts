import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
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
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: [
    "/author-dashboard/finance",
    "/author-dashboard/commercial/payout-details",
  ],
  relatedArticleIds: ["help.finance.commercial-status"],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Раздел «Финансы» показывает продажи, начисленное авторское вознаграждение и историю выплат. Доступен авторам с активным коммерческим статусом.",
      ],
    },
    {
      id: "steps",
      title: "Где смотреть деньги",
      steps: [
        helpRich(
          "Откройте кабинет автора → «Финансы» (",
          helpPublicLink("/author-dashboard/finance"),
          ").",
        ),
        "Проверьте начисления и продажи за выбранный период.",
        "Откройте историю выплат и статусы переводов.",
        helpRich(
          "Если реквизиты ещё не заполнены, перейдите в «Данные для выплат» (",
          helpPublicLink("/author-dashboard/commercial/payout-details"),
          ").",
        ),
      ],
      notes: [
        "Без коммерческого статуса раздел финансов может быть недоступен или показывать подсказку о подключении.",
        "Выплаты выполняются по правилам платформы после проверки реквизитов.",
      ],
    },
  ],
  cta: {
    label: "Открыть финансы",
    href: "/author-dashboard/finance",
  },
};
