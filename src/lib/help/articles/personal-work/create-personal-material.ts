import type { HelpArticle } from "@/lib/help/types";

export const createPersonalMaterialArticle: HelpArticle = {
  id: "help.personal-work.create-personal-material",
  slug: "create-personal-material",
  title: "Как создать личный материал",
  description:
    "Создайте персональный аудиоматериал или диагностику для работы с конкретным клиентом.",
  category: "personal-work",
  audience: "author",
  order: 10,
  keywords: [
    "личный материал",
    "диагностика",
    "личная работа",
    "персональный материал",
    "клиент",
    "черновик",
  ],
  updatedAt: "2026-07-29",
  version: 1,
  relatedRoutes: [
    "/author-dashboard/diagnostics",
    "/author-dashboard/diagnostics/new",
  ],
  relatedArticleIds: [
    "help.personal-work.send-personal-material",
    "help.authors.create-first-product",
  ],
  sections: [
    {
      id: "intro",
      paragraphs: [
        "Личные материалы предназначены для персональной работы с клиентом — это не публичные продукты каталога. Раздел «Личная работа» находится в навигации кабинета автора.",
      ],
    },
    {
      id: "steps",
      title: "Как создать материал",
      steps: [
        "Откройте кабинет автора → «Личная работа» (/author-dashboard/diagnostics).",
        "Нажмите «Создать личный материал».",
        "Укажите название, тип материала и при необходимости персональную рекомендацию.",
        "Загрузите аудио или PDF — в зависимости от выбранного формата.",
        "Сохраните черновик. Активация и отправка ссылки клиенту выполняются отдельно.",
      ],
    },
    {
      id: "notes",
      title: "Ограничения",
      notes: [
        "До активации материал остаётся черновиком и его можно редактировать.",
        "После активации редактирование ограничено — черновик нельзя будет изменить.",
        "Персональная ссылка для клиента появляется только после активации.",
      ],
    },
  ],
  cta: {
    label: "Создать личный материал",
    href: "/author-dashboard/diagnostics/new",
  },
};
