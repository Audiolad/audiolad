import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const saveToLibraryArticle: HelpArticle = {
  id: "help.listeners.save-to-library",
  slug: "save-to-library",
  title: "Как сохранить практику в Аудиотеку",
  description:
    "Добавьте практику в Аудиотеку, чтобы возвращаться к ней из личного раздела.",
  category: "getting-started",
  audience: "listener",
  order: 30,
  keywords: [
    "аудиотека",
    "сохранить практику",
    "добавить в аудиотеку",
    "библиотека",
    "мои практики",
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: ["/catalog", "/listen"],
  relatedArticleIds: [
    "help.listeners.sign-up-and-sign-in",
    "help.listeners.install-on-phone",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Аудиотека хранит выбранные практики в вашем аккаунте. Для сохранения нужен вход в АудиоЛад.",
      ],
    },
    {
      id: "steps",
      title: "Как добавить практику",
      steps: [
        "Откройте карточку практики в каталоге или на странице прослушивания.",
        "Нажмите «Добавить в Аудиотеку» или «Сохранить в Аудиотеку».",
        "Если вы ещё не вошли, завершите вход или регистрацию и повторите действие.",
        helpRich(
          "Откройте раздел прослушивания (",
          helpPublicLink("/listen"),
          "), чтобы найти сохранённые материалы.",
        ),
      ],
      notes: [
        "Если кнопка показывает «В Аудиотеке», практика уже сохранена.",
        "Часть практик может добавляться автоматически как стартовые — они тоже отображаются в Аудиотеке.",
      ],
    },
  ],
  cta: {
    label: "Открыть каталог",
    href: "/catalog",
  },
};
