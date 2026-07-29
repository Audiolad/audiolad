import type { HelpCategory, HelpCategoryId } from "@/lib/help/types";
import { HELP_CATEGORY_IDS } from "@/lib/help/types";

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    id: "getting-started",
    title: "Начало работы",
    description: "Регистрация, вход, Аудиотека и установка приложения.",
    order: 10,
    hubPath: "/help/listeners",
  },
  {
    id: "authors",
    title: "Для авторов",
    description: "Страница автора, создание и публикация аудиопродуктов.",
    order: 20,
    hubPath: "/help/authors",
  },
  {
    id: "personal-work",
    title: "Личная работа",
    description: "Диагностики, персональные материалы и ссылки для клиентов.",
    order: 30,
  },
  {
    id: "promotion",
    title: "Продвижение",
    description: "Промостраницы, кампании и статистика переходов.",
    order: 40,
  },
  {
    id: "finance",
    title: "Продажи и финансы",
    description: "Коммерческий статус, начисления и выплаты.",
    order: 50,
  },
  {
    id: "troubleshooting",
    title: "Решение проблем",
    description: "Типовые ошибки входа, писем, публикации и доступа.",
    order: 60,
  },
] as const;

const BY_ID = new Map(HELP_CATEGORIES.map((category) => [category.id, category]));

export function isHelpCategoryId(value: string): value is HelpCategoryId {
  return (HELP_CATEGORY_IDS as readonly string[]).includes(value);
}

export function getHelpCategory(id: HelpCategoryId): HelpCategory {
  const category = BY_ID.get(id);
  if (!category) {
    throw new Error(`unknown_help_category:${id}`);
  }
  return category;
}

export function listHelpCategories(): HelpCategory[] {
  return [...HELP_CATEGORIES].sort((a, b) => a.order - b.order);
}
