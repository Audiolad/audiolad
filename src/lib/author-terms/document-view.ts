import {
  AUTHOR_TERMS_APPROVED_META,
  AUTHOR_TERMS_APPROVED_TEXT,
  AUTHOR_TERMS_TOC,
} from "@/lib/author-terms/approved-content";

export type AuthorTermsDocumentBlock =
  | { type: "heading"; level: 1 | 2; text: string; id?: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function sectionIdForHeading(text: string): string | undefined {
  const match = text.match(/^(\d+)\.\s+/);
  if (!match) {
    return undefined;
  }

  return `section-${match[1]}`;
}

/**
 * Drop DOCX front matter that the public page already renders separately:
 * brand line, document title, and the plain-text «Содержание» list.
 * Legal wording of the body is left unchanged.
 */
export function stripAuthorTermsFrontMatter(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const marker = "Настоящие Авторские условия сотрудничества";
  const index = normalized.indexOf(marker);
  if (index < 0) {
    return normalized;
  }

  return normalized.slice(index);
}

/** Split approved plain text into render blocks without altering wording. */
export function buildAuthorTermsDocumentBlocks(
  text: string = AUTHOR_TERMS_APPROVED_TEXT,
): AuthorTermsDocumentBlock[] {
  const lines = stripAuthorTermsFrontMatter(text).split("\n");
  const blocks: AuthorTermsDocumentBlock[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Numbered section titles (1. … 25.), but not clause numbers (1.1.).
    if (/^\d+\.\s+\S/.test(trimmed) && !/^\d+\.\d+/.test(trimmed)) {
      flushList();
      blocks.push({
        type: "heading",
        level: 2,
        text: trimmed,
        id: sectionIdForHeading(trimmed),
      });
      continue;
    }

    if (trimmed.startsWith("•")) {
      listItems.push(trimmed.replace(/^•\s*/, ""));
      continue;
    }

    flushList();
    blocks.push({ type: "paragraph", text: trimmed });
  }

  flushList();
  return blocks;
}

export function getAuthorTermsPublicMeta() {
  return {
    ...AUTHOR_TERMS_APPROVED_META,
    toc: AUTHOR_TERMS_TOC,
  };
}
