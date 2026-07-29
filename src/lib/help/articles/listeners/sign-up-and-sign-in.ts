import type { HelpArticle } from "@/lib/help/types";

export const signUpAndSignInArticle: HelpArticle = {
  id: "help.listeners.sign-up-and-sign-in",
  slug: "sign-up-and-sign-in",
  title: "Как зарегистрироваться и войти",
  description:
    "Создайте аккаунт на АудиоЛаде или войдите, чтобы слушать практики и сохранять их в Аудиотеку.",
  category: "getting-started",
  audience: "listener",
  order: 10,
  keywords: [
    "регистрация",
    "вход",
    "аккаунт",
    "sign up",
    "sign in",
    "email",
    "пароль",
  ],
  updatedAt: "2026-07-29",
  version: 1,
  relatedRoutes: [
    "/auth/sign-up",
    "/auth/sign-in",
  ],
  relatedArticleIds: [
    "help.listeners.save-to-library",
    "help.listeners.reset-password",
    "help.listeners.install-on-phone",
    "help.troubleshooting.email-not-received",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Аккаунт нужен, чтобы сохранять практики в Аудиотеку, продолжать прослушивание с разных устройств и получать доступ к купленным материалам.",
      ],
    },
    {
      id: "signup",
      title: "Регистрация",
      steps: [
        "Откройте страницу /auth/sign-up.",
        "Заполните поля «Имя», «Фамилия», «Email» и «Придумайте пароль» (минимум 8 символов).",
        "Примите обязательное согласие с условиями использования платформы.",
        "Нажмите «Зарегистрироваться».",
        "После успешной регистрации перейдите на страницу входа и авторизуйтесь.",
      ],
    },
    {
      id: "signin",
      title: "Вход",
      steps: [
        "Откройте /auth/sign-in.",
        "Введите email и пароль.",
        "Нажмите «Войти» — после успешного входа откроется запрошенная страница или профиль.",
      ],
      notes: [
        "Если вы перешли по ссылке с параметром next, после входа вернётесь на нужную страницу.",
        "Забыли пароль? Используйте статью о восстановлении пароля.",
      ],
    },
  ],
  cta: {
    label: "Зарегистрироваться",
    href: "/auth/sign-up",
  },
};
