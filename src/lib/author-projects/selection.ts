import type { AuthorWorkspace } from "@/lib/author-products/types";

import { AUTHOR_PROJECT_COOKIE } from "@/lib/author-projects/constants";

export function resolveSelectedAuthorWorkspace(
  authors: AuthorWorkspace[],
  options?: {
    querySlug?: string | null;
    cookieSlug?: string | null;
  },
): AuthorWorkspace | null {
  if (authors.length === 0) {
    return null;
  }

  const querySlug = options?.querySlug?.trim() || null;
  if (querySlug) {
    const byQuery = authors.find((author) => author.slug === querySlug);
    if (byQuery) {
      return byQuery;
    }
  }

  const cookieSlug = options?.cookieSlug?.trim() || null;
  if (cookieSlug) {
    const byCookie = authors.find((author) => author.slug === cookieSlug);
    if (byCookie) {
      return byCookie;
    }
  }

  return authors[0] ?? null;
}

export function readAuthorProjectCookieValue(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== AUTHOR_PROJECT_COOKIE) {
      continue;
    }
    const rawValue = rest.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue || null;
    }
  }

  return null;
}

export function buildAuthorProjectCookie(slug: string): string {
  const safe = encodeURIComponent(slug.trim());
  return `${AUTHOR_PROJECT_COOKIE}=${safe}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function setAuthorProjectCookieClient(slug: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = buildAuthorProjectCookie(slug);
}

export function withAuthorQuery(href: string, authorSlug: string | null | undefined) {
  if (!authorSlug) {
    return href;
  }

  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("author", authorSlug);
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}
