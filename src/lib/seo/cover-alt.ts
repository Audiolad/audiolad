import {
  getMusicReleaseLabel,
  isMusicProductKind,
} from "@/lib/author-products/product-kind";
import { isProgramFormat } from "@/lib/products/practice-access-ui";

type ProductCoverAltInput = {
  title: string;
  authorName?: string | null;
  format?: string | null;
  productKind?: string | null;
  audioCount?: number | null;
};

function normalizeTitle(title: string): string {
  const trimmed = title.trim();

  return trimmed || "Без названия";
}

function authorSuffix(authorName?: string | null): string {
  const trimmed = authorName?.trim();

  return trimmed ? ` – ${trimmed}` : "";
}

/** Alt text for product / program cover images on public pages. */
export function buildProductCoverAlt(input: ProductCoverAltInput): string {
  const title = normalizeTitle(input.title);
  const suffix = authorSuffix(input.authorName);

  if (isMusicProductKind(input.productKind)) {
    const release = getMusicReleaseLabel(
      typeof input.audioCount === "number" ? input.audioCount : 1,
    );
    return `Обложка: ${release.toLowerCase()} «${title}»${suffix}`;
  }

  if (isProgramFormat(input.format ?? null)) {
    return `Обложка программы аудиопрактик «${title}»${suffix}`;
  }

  return `Обложка аудиопрактики «${title}»${suffix}`;
}

/** Alt text for public playlist cover images. */
export function buildPlaylistCoverAlt(title: string): string {
  const normalized = normalizeTitle(title);

  return `Обложка плейлиста «${normalized}» на АудиоЛаде`;
}

/** Alt text for author avatar images on public pages. */
export function buildAuthorAvatarAlt(authorName: string): string {
  const normalized = authorName.trim() || "Автор";

  return `Аватар автора ${normalized}`;
}
