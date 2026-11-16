"use client";

import { useEffect } from "react";

import { setAuthorProjectCookieClient } from "@/lib/author-projects/selection";

/** Keeps the author cabinet's sticky author selection in step with an explicit studio choice. */
export function StudioAuthorSelectionSync({ slug }: { slug: string }) {
  useEffect(() => {
    setAuthorProjectCookieClient(slug);
  }, [slug]);
  return null;
}
