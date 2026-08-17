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

/** Plain text segment inside a help paragraph/step/note. */
export type HelpInlineText = {
  type: "text";
  value: string;
};

/**
 * Explicit link segment. Prefer relative `href` for internal pages;
 * `label` is the user-visible absolute URL (e.g. https://audiolad.ru/...).
 */
export type HelpInlineLink = {
  type: "link";
  href: string;
  label: string;
  external?: boolean;
};

export type HelpInlineNode = HelpInlineText | HelpInlineLink;

/**
 * Body content may stay a plain string (no links) or use typed inline nodes.
 * Do not embed bare "/path" routes inside plain strings for user destinations.
 */
export type HelpRichText = string | HelpInlineNode[];

export type HelpArticleFigure = {
  id: string;
  /** Public path under /public. Renderer skips the image if the file is absent. */
  src?: string;
  alt: string;
  caption: string;
};

export type HelpFaqItem = {
  question: string;
  answer: HelpRichText;
};

export type HelpArticleStepRecord = {
  text: HelpRichText;
  figure?: HelpArticleFigure;
};

/** Plain rich text, or a step with an optional illustration after the text. */
export type HelpArticleStep = HelpRichText | HelpArticleStepRecord;

export function isHelpStepRecord(
  value: HelpArticleStep,
): value is HelpArticleStepRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "text" in value
  );
}

export function getHelpStepText(step: HelpArticleStep): HelpRichText {
  return isHelpStepRecord(step) ? step.text : step;
}

export function getHelpStepFigure(
  step: HelpArticleStep,
): HelpArticleFigure | undefined {
  return isHelpStepRecord(step) ? step.figure : undefined;
}

export type HelpArticleSection = {
  id: string;
  title?: string;
  /** Defaults to 2. Use 3 for subsections (Edge/Chrome, FAQ answers stay as H3). */
  headingLevel?: 2 | 3;
  paragraphs?: HelpRichText[];
  steps?: HelpArticleStep[];
  notes?: HelpRichText[];
  figures?: HelpArticleFigure[];
  faq?: HelpFaqItem[];
};

export type HelpArticleCta = {
  label: string;
  href: string;
};

export type HelpArticle = {
  /** Stable knowledge-base ID for future retrieval / AI. */
  id: string;
  slug: string;
  /** Card, breadcrumb and search title. */
  title: string;
  /** Optional H1 override. Defaults to `title`. */
  heading?: string;
  /** Card and hub description. */
  description: string;
  /** Optional document title. Defaults to `${title} – Справочный центр АудиоЛад`. */
  seoTitle?: string;
  /** Optional meta description. Defaults to `description`. */
  seoDescription?: string;
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
