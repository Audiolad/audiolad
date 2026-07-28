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

/** Split approved plain text into render blocks without altering wording. */
export function buildAuthorTermsDocumentBlocks(
  text: string = AUTHOR_TERMS_APPROVED_TEXT,
): AuthorTermsDocumentBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
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

    if (trimmed === "АУДИОЛАД") {
      flushList();
      blocks.push({ type: "heading", level: 1, text: trimmed });
      continue;
    }

    if (
      trimmed.startsWith("Авторские условия сотрудничества") &&
      !trimmed.match(/^\d+\./)
    ) {
      flushList();
      blocks.push({ type: "heading", level: 1, text: trimmed });
      continue;
    }

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
