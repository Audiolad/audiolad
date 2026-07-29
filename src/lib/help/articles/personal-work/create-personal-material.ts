import { helpPublicLink, helpRich } from "@/lib/help/rich-text";
import type { HelpArticle } from "@/lib/help/types";

export const createPersonalMaterialArticle: HelpArticle = {
  id: "help.personal-work.create-personal-material",
  slug: "create-personal-material",
  title: "Как создать личный материал",
  description:
    "Создайте персональный аудиоразбор или диагностику для клиента в разделе «Личная работа».",
  category: "personal-work",
  audience: "author",
  order: 10,
  keywords: [
    "личный материал",
    "диагностика",
    "персональный разбор",
    "личная работа",
    "создать материал",
  ],
  updatedAt: "2026-07-29",
  version: 2,
  relatedRoutes: [
    "/author-dashboard/diagnostics",
    "/author-dashboard/diagnostics/new",
  ],
  relatedArticleIds: ["help.personal-work.send-personal-material"],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Личные материалы предназначены для конкретного клиента. Они создаются в разделе «Личная работа» и не публикуются в общем каталоге.",
      ],
    },
    {
      id: "steps",
      title: "Как создать материал",
      steps: [
        helpRich(
          "Откройте кабинет автора → «Личная работа» (",
          helpPublicLink("/author-dashboard/diagnostics"),
          ").",
        ),
        "Нажмите «Создать личный материал».",
        "Выберите «Создать с нуля» или «Создать из шаблона».",
        "Заполните название, данные клиента и описание.",
        "Загрузите аудио и при необходимости PDF.",
        "Нажмите «Создать черновик» и сохраните материал.",
      ],
      notes: [
        "Черновик можно доработать перед активацией и отправкой клиенту.",
        "Шаблоны удобны, если вы часто готовите материалы одного формата.",
      ],
    },
  ],
  cta: {
    label: "Создать личный материал",
    href: "/author-dashboard/diagnostics/new",
  },
};
