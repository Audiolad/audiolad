import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const emailNotReceivedArticle: HelpArticle = {
  id: "help.troubleshooting.email-not-received",
  slug: "email-not-received",
  title: "Что делать, если письмо не пришло",
  description:
    "Проверьте спам, подождите несколько минут и повторите запрос, если не пришло письмо для входа или восстановления пароля.",
  category: "troubleshooting",
  audience: "both",
  order: 10,
  keywords: [
    "не пришло письмо",
    "письмо не приходит",
    "спам",
    "почта",
    "подтверждение",
    "восстановление пароля",
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: ["/auth/forgot-password", "/auth/sign-in", "/help/support"],
  relatedArticleIds: [
    "help.listeners.reset-password",
    "help.listeners.sign-up-and-sign-in",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Письма АудиоЛада иногда попадают в «Спам» или приходят с небольшой задержкой. Сначала проверьте почтовый ящик и повторите запрос.",
      ],
    },
    {
      id: "steps",
      title: "Что проверить",
      steps: [
        "Убедитесь, что указали тот же email, которым регистрировались.",
        "Проверьте папки «Спам», «Промоакции» и похожие разделы почты.",
        "Подождите 2–5 минут — доставка может занять короткое время.",
        helpRich(
          "Если запрашивали восстановление пароля, повторите отправку на ",
          helpPublicLink("/auth/forgot-password"),
          " — повтор доступен через минуту после предыдущей попытки.",
        ),
        helpRich(
          "Если письмо так и не пришло, обратитесь в поддержку через ",
          helpPublicLink("/help/support"),
          " и укажите email аккаунта.",
        ),
      ],
      notes: [
        "Не нужно отправлять пароль в обращении — достаточно email и описания ситуации.",
      ],
    },
  ],
  cta: {
    label: "Задать вопрос поддержке",
    href: "/help/support",
  },
};
