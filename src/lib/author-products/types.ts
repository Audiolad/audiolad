export const PRODUCT_FORMATS = [
  "Аудиопрактика",
  "Медитация",
  "Авторский аудиоподкаст",
  "Лекция",
  "Программа аудиопрактик",
  "Аудиокурс",
  "Цикл практик",
  "Сборник",
  "Аудиокнига",
  "Другое",
] as const;

export const PAID_PRICE_OPTIONS = [99, 199, 299, 444, 888, 1888, 2888] as const;

export const PRACTICE_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
} as const;

export type PracticeStatus =
  (typeof PRACTICE_STATUS)[keyof typeof PRACTICE_STATUS];

export type AuthorMemberRole = "owner" | "editor";

export type AuthorWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: AuthorMemberRole;
};

export type AudioItemRow = {
  id: string;
  practice_id: string;
  title: string;
  description: string | null;
  audio_path: string | null;
  duration_seconds: number | null;
  position: number;
  is_preview: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PracticeRow = {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number;
  is_free: boolean;
  cover_url: string | null;
  audio_url: string | null;
  status: string;
  currency: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthorProductListItem = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  price: number;
  is_free: boolean;
  status: string;
  cover_url: string | null;
  updated_at: string;
  audio_count: number;
};

export type AuthorProductDetail = {
  practice: PracticeRow;
  audio_items: AudioItemRow[];
};

export function getStatusLabel(status: string): string {
  switch (status) {
    case "published":
      return "Опубликован";
    case "archived":
      return "Снят с публикации";
    case "draft":
    default:
      return "Черновик";
  }
}

export function formatPriceLabel(price: number, isFree: boolean): string {
  if (isFree || price <= 0) {
    return "Бесплатно";
  }

  return `${price.toLocaleString("ru-RU")} ₽`;
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
