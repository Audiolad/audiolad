export const HELP_AUDIENCES = ["listener", "author", "both"] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];

export const HELP_CATEGORY_IDS = [
  "getting-started",
  "authors",
  "personal-work",
  "promotion",
  "finance",
  "troubleshooting",
] as const;
export type HelpCategoryId = (typeof HELP_CATEGORY_IDS)[number];

export type HelpArticleSection = {
  id: string;
  title?: string;
  paragraphs?: string[];
  steps?: string[];
  notes?: string[];
};

export type HelpArticleCta = {
  label: string;
  href: string;
};

export type HelpArticle = {
  /** Stable knowledge-base ID for future retrieval / AI. */
  id: string;
  slug: string;
  title: string;
  description: string;
  category: HelpCategoryId;
  audience: HelpAudience;
  order: number;
  keywords: string[];
  updatedAt: string;
  version: number;
  relatedRoutes: string[];
  relatedArticleIds: string[];
  sections: HelpArticleSection[];
  cta?: HelpArticleCta;
};

export type HelpCategory = {
  id: HelpCategoryId;
  title: string;
  description: string;
  order: number;
  /** Hub path: /help/listeners or /help/authors or category listing via /help */
  hubPath?: string;
};

export type HelpSearchHit = {
  articleId: string;
  slug: string;
  category: HelpCategoryId;
  title: string;
  description: string;
  score: number;
  href: string;
};

export const SUPPORT_REQUEST_STATUSES = [
  "new",
  "in_progress",
  "answered",
  "closed",
] as const;
export type SupportRequestStatus = (typeof SUPPORT_REQUEST_STATUSES)[number];

export const SUPPORT_REQUEST_CATEGORIES = [
  "account",
  "listening",
  "authoring",
  "personal-materials",
  "promotion",
  "payments",
  "technical",
  "other",
] as const;
export type SupportRequestCategory =
  (typeof SUPPORT_REQUEST_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportRequestCategory, string> = {
  account: "Аккаунт и вход",
  listening: "Прослушивание и Аудиотека",
  authoring: "Создание и публикация продуктов",
  "personal-materials": "Личные материалы",
  promotion: "Продвижение и статистика",
  payments: "Продажи и выплаты",
  technical: "Техническая проблема",
  other: "Другое",
};
