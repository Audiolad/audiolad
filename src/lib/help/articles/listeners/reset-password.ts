import type { HelpArticle } from "@/lib/help/types";

export const resetPasswordArticle: HelpArticle = {
  id: "help.listeners.reset-password",
  slug: "reset-password",
  title: "Как восстановить пароль",
  description:
    "Запросите ссылку для смены пароля, если забыли текущий или не можете войти в аккаунт.",
  category: "getting-started",
  audience: "listener",
  order: 20,
  keywords: [
    "восстановление пароля",
    "забыл пароль",
    "сброс пароля",
    "forgot password",
    "письмо",
  ],
  updatedAt: "2026-07-29",
  version: 1,
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
        "Восстановление пароля выполняется через email. На указанный адрес придёт ссылка для установки нового пароля.",
      ],
    },
    {
      id: "steps",
      title: "Как восстановить пароль",
      steps: [
        "Откройте /auth/sign-in и нажмите ссылку на восстановление пароля или перейдите на /auth/forgot-password.",
        "Введите email, который использовали при регистрации.",
        "Нажмите «Отправить ссылку».",
        "Проверьте почту — если аккаунт существует, придёт письмо со ссылкой для восстановления.",
        "Перейдите по ссылке из письма и задайте новый пароль на странице /auth/reset-password.",
        "Войдите с новым паролем через /auth/sign-in.",
      ],
    },
    {
      id: "notes",
      title: "Если письмо не пришло",
      notes: [
        "Проверьте папки «Спам» и «Рассылки» — письмо может прийти в течение нескольких минут.",
        "Повторная отправка доступна через минуту после предыдущей попытки.",
        "Ссылка для смены пароля имеет ограниченный срок действия — при ошибке запросите восстановление заново.",
        "Подробнее — в статье «Не приходит письмо».",
      ],
    },
  ],
  cta: {
    label: "Восстановить пароль",
    href: "/auth/forgot-password",
  },
};
