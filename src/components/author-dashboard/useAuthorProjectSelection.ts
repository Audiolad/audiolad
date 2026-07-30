"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import type { AuthorWorkspace } from "@/lib/author-products/types";
import { AUTHOR_PROJECT_COOKIE } from "@/lib/author-projects/constants";
import {
  resolveSelectedAuthorWorkspace,
  setAuthorProjectCookieClient,
} from "@/lib/author-projects/selection";

function readCookieSlug(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTHOR_PROJECT_COOKIE}=`));

  if (!match) {
    return null;
  }

  const value = match.slice(AUTHOR_PROJECT_COOKIE.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value || null;
  }
}

export function useAuthorProjectSelection(
  authors: AuthorWorkspace[],
  pathname: string,
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const querySlug = searchParams.get("author");

  const selectedAuthor = useMemo(
    () =>
      resolveSelectedAuthorWorkspace(authors, {
        querySlug,
        cookieSlug: readCookieSlug(),
      }),
    [authors, querySlug],
  );

  useEffect(() => {
    if (!selectedAuthor) {
      return;
    }

    if (querySlug === selectedAuthor.slug) {
      setAuthorProjectCookieClient(selectedAuthor.slug);
      return;
    }

    if (!querySlug) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("author", selectedAuthor.slug);
      setAuthorProjectCookieClient(selectedAuthor.slug);
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [pathname, querySlug, router, searchParams, selectedAuthor]);

  function selectAuthor(slug: string) {
    setAuthorProjectCookieClient(slug);
    const params = new URLSearchParams(searchParams.toString());
    params.set("author", slug);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return { selectedAuthor, selectAuthor };
}
