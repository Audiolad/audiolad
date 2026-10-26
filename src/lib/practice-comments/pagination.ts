export const COMMENT_PAGE_DEFAULT = 10;
export const COMMENT_PAGE_MAX = 20;

export type CommentSort = "new" | "old";

export type CommentCursor = {
  createdAt: string;
  id: string;
};

export function parseCommentSort(input: unknown): CommentSort | null {
  if (input == null || input === "" || input === "new") {
    return "new";
  }
  if (input === "old") {
    return "old";
  }
  return null;
}

export function parseCommentLimit(input: unknown): number | null {
  if (input == null || input === "") {
    return COMMENT_PAGE_DEFAULT;
  }
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isInteger(value) || value < 1 || value > COMMENT_PAGE_MAX) {
    return null;
  }
  return value;
}

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function encodeCommentCursor(cursor: CommentCursor): string {
  const createdAt = new Date(cursor.createdAt).toISOString();
  return Buffer.from(JSON.stringify({ t: createdAt, id: cursor.id }), "utf8").toString("base64url");
}

export function decodeCommentCursor(input: string | null | undefined): CommentCursor | null {
  if (!input) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(input, "base64url").toString("utf8")) as {
      t?: unknown;
      id?: unknown;
    };
    if (typeof parsed.t !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    if (!CURSOR_TIME.test(parsed.t) || !Number.isFinite(Date.parse(parsed.t))) {
      return null;
    }
    if (!/^[0-9a-f-]{36}$/i.test(parsed.id)) {
      return null;
    }
    return { createdAt: parsed.t, id: parsed.id };
  } catch {
    return null;
  }
}

export function compareComments(
  sort: CommentSort,
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
): number {
  const time = left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0;
  const id = left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  const ascending = time || id;
  return sort === "old" ? ascending : -ascending;
}

export function parseCommentPageQuery(params: URLSearchParams): {
  sort: CommentSort;
  limit: number;
  cursor: CommentCursor | null;
} | null {
  const sort = parseCommentSort(params.get("sort"));
  const limit = parseCommentLimit(params.get("limit"));
  const cursorRaw = params.get("cursor");
  if (!sort || limit == null) return null;
  if (!cursorRaw) return { sort, limit, cursor: null };
  const cursor = decodeCommentCursor(cursorRaw);
  if (!cursor) return null;
  return { sort, limit, cursor };
}

export function isAfterCursor(
  sort: CommentSort,
  row: { createdAt: string; id: string },
  cursor: CommentCursor,
): boolean {
  return compareComments(sort, row, cursor) > 0;
}
