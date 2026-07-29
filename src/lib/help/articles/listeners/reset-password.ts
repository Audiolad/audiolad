import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const resetPasswordArticle: HelpArticle = {
  id: "help.listeners.reset-password",
  slug: "reset-password",
  title: "Как восстановить пароль",
  description:
    "Запросите письмо для сброса пароля и задайте новый пароль для входа в АудиоЛад.",
  category: "getting-started",
  audience: "listener",
  order: 20,
  keywords: [
    "восстановить пароль",
    "сброс пароля",
    "забыл пароль",
    "новое письмо",
    "reset password",
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: [
    "/auth/forgot-password",
    "/auth/sign-in",
    "/auth/reset-password",
  ],
  relatedArticleIds: [
    "help.listeners.sign-up-and-sign-in",
    "help.troubleshooting.email-not-received",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Если пароль забыт, запросите письмо для восстановления. Ссылка из письма ведёт на страницу задания нового пароля.",
      ],
    },
    {
      id: "steps",
      title: "Как сбросить пароль",
      steps: [
        helpRich(
          "Откройте ",
          helpPublicLink("/auth/sign-in"),
          " и нажмите ссылку на восстановление пароля или перейдите на ",
          helpPublicLink("/auth/forgot-password"),
          ".",
        ),
        "Укажите электронную почту аккаунта и отправьте запрос.",
        "Откройте письмо от АудиоЛада и перейдите по ссылке.",
        helpRich(
          "Задайте новый пароль на странице ",
          helpPublicLink("/auth/reset-password"),
          ".",
        ),
        helpRich(
          "Войдите с новым паролем через ",
          helpPublicLink("/auth/sign-in"),
          ".",
        ),
      ],
      notes: [
        "Повторный запрос письма обычно доступен через минуту после предыдущей попытки.",
        "Если письмо не приходит, проверьте «Спам» и откройте инструкцию «Что делать, если письмо не пришло».",
      ],
    },
  ],
  cta: {
    label: "Восстановить пароль",
    href: "/auth/forgot-password",
  },
};
