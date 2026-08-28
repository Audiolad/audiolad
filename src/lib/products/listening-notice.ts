import { isCoursePublication } from "@/lib/author-products/publication-class";

export const DEFAULT_LISTENING_NOTICE_TITLE = "Перед прослушиванием";

export const DEFAULT_LISTENING_NOTICE_TEXT =
  "Выберите спокойное и безопасное место для прослушивания.\n\nНе включайте практику во время управления транспортом или работы, требующей постоянной концентрации.";

export type ListeningNoticeFields = {
  listening_notice_enabled?: boolean | null;
  listening_notice_title?: string | null;
  listening_notice_text?: string | null;
};

export type ListeningNoticePublicationInput = {
  publication_class?: string | null;
  product_kind?: string | null;
};

export type ResolvedListeningNotice = {
  title: string;
  text: string;
};

export function isListeningNoticeEnabled(
  value: boolean | null | undefined,
): boolean {
  return value !== false;
}

/**
 * Public and author-editor gate: hide the listening notice for courses only.
 * Audiobook, practice, music, and audio post keep current behavior.
 */
export function shouldShowListeningNoticeForPublication(
  publicationClass: string | null | undefined,
  productKind?: string | null | undefined,
): boolean {
  return !isCoursePublication(publicationClass, productKind);
}

export function resolveListeningNoticeTitle(
  value: string | null | undefined,
): string {
  const trimmed = value?.trim();

  if (trimmed) {
    return trimmed;
  }

  return DEFAULT_LISTENING_NOTICE_TITLE;
}

export function resolveListeningNoticeText(
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) {
    return DEFAULT_LISTENING_NOTICE_TEXT;
  }

  return value;
}

/**
 * Returns public card content or null when the block must be hidden.
 * Backward-compatible: missing/disabled=false hides; missing title/text fall back to defaults.
 */
export function resolveListeningNotice(
  input: ListeningNoticeFields | null | undefined,
): ResolvedListeningNotice | null {
  if (!isListeningNoticeEnabled(input?.listening_notice_enabled)) {
    return null;
  }

  const text = resolveListeningNoticeText(
    input?.listening_notice_text,
  ).trim();

  if (!text) {
    return null;
  }

  return {
    title: resolveListeningNoticeTitle(input?.listening_notice_title),
    text,
  };
}

/**
 * Public PDP / listen-route resolver. Data resolution stays in
 * `resolveListeningNotice`; this wrapper gates on publication class.
 */
export function resolvePublicListeningNotice(
  input:
    | (ListeningNoticeFields & ListeningNoticePublicationInput)
    | null
    | undefined,
): ResolvedListeningNotice | null {
  if (
    !shouldShowListeningNoticeForPublication(
      input?.publication_class,
      input?.product_kind,
    )
  ) {
    return null;
  }

  return resolveListeningNotice(input);
}

export function createDefaultListeningNoticeFormState(): {
  listeningNoticeEnabled: boolean;
  listeningNoticeTitle: string;
  listeningNoticeText: string;
} {
  return {
    listeningNoticeEnabled: true,
    listeningNoticeTitle: DEFAULT_LISTENING_NOTICE_TITLE,
    listeningNoticeText: DEFAULT_LISTENING_NOTICE_TEXT,
  };
}
