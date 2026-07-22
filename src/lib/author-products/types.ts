import { getProductPriceLabel } from "@/lib/products/price-format";
import type { AuthorAccessStatus } from "@/lib/authors/access";
import {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
} from "@/lib/authors/access";

export const PAID_PRICE_OPTIONS = [99, 199, 299, 444, 888, 1888, 2888] as const;

export const PRACTICE_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  UNPUBLISHED: "unpublished",
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
  accessStatus: AuthorAccessStatus;
};

export type AudioItemRow = {
  id: string;
  practice_id: string;
  title: string;
  description: string | null;
  audio_path: string | null;
  cover_url: string | null;
  cover_image?: unknown;
  duration_seconds: number | null;
  original_file_name: string | null;
  file_size_bytes: number | null;
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
  cover_image?: unknown;
  use_shared_cover: boolean;
  audio_url: string | null;
  status: string;
  currency: string;
  published_at: string | null;
  listening_notice_enabled: boolean;
  listening_notice_title: string;
  listening_notice_text: string;
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
  cover_image?: unknown;
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
    case "unpublished":
      return "Снят с публикации";
    case "archived":
      return "В архиве";
    case "draft":
    default:
      return "Черновик";
  }
}

export function getStatusClassName(status: string): string {
  switch (status) {
    case "published":
      return "bg-[#eaf7ef] text-[#3d8d65]";
    case "unpublished":
      return "bg-[#eef3ff] text-[#4f6db8]";
    case "archived":
      return "bg-[#f2f2f7] text-[#6d6d80]";
    default:
      return "bg-[#fff4df] text-[#b67a1d]";
  }
}

export function formatPriceLabel(price: number, isFree: boolean): string {
  return getProductPriceLabel(price, isFree);
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

export {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
};
