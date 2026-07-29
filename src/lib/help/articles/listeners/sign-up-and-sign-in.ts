import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const signUpAndSignInArticle: HelpArticle = {
  id: "help.listeners.sign-up-and-sign-in",
  slug: "sign-up-and-sign-in",
  title: "Как зарегистрироваться и войти",
  description:
    "Создайте аккаунт АудиоЛада и войдите, чтобы сохранять практики в Аудиотеке и пользоваться личным кабинетом.",
  category: "getting-started",
  audience: "listener",
  order: 10,
  keywords: [
    "регистрация",
    "вход",
    "аккаунт",
    "создать аккаунт",
    "войти",
    "sign up",
    "sign in",
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: ["/auth/sign-up", "/auth/sign-in"],
  relatedArticleIds: [
    "help.listeners.reset-password",
    "help.listeners.save-to-library",
    "help.troubleshooting.email-not-received",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Регистрация нужна, чтобы сохранять практики, синхронизировать прогресс и пользоваться личными разделами. Вход выполняется по электронной почте и паролю.",
      ],
    },
    {
      id: "sign-up",
      title: "Как зарегистрироваться",
      steps: [
        helpRich("Откройте страницу ", helpPublicLink("/auth/sign-up"), "."),
        "Укажите имя, электронную почту и пароль.",
        "Отправьте форму регистрации.",
        "После успешной регистрации откройте страницу входа и войдите в аккаунт.",
      ],
    },
    {
      id: "sign-in",
      title: "Как войти",
      steps: [
        helpRich("Откройте ", helpPublicLink("/auth/sign-in"), "."),
        "Введите электронную почту и пароль.",
        "Нажмите кнопку входа.",
      ],
      notes: [
        "Если письмо с подтверждением или восстановлением не пришло, проверьте папку «Спам» и откройте инструкцию «Что делать, если письмо не пришло».",
      ],
    },
  ],
  cta: {
    label: "Зарегистрироваться",
    href: "/auth/sign-up",
  },
};
