"use client";

import { useState } from "react";

import { AuthorOpportunitiesContent } from "@/components/author-dashboard/AuthorOpportunitiesClient";
import type { AuthorOpportunitiesViewModel } from "@/lib/author-dashboard/opportunities";

type Props = {
  authorId: string;
};

function NestedChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-5 w-5 shrink-0 text-[#7042c5] transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Nested opportunities hub inside the outer onboarding shell.
 * Always mounts collapsed; expanded state is not persisted.
 * Remount via key={authorId} from the parent when the author changes.
 */
export default function AuthorOpportunitiesNestedPanel({ authorId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<AuthorOpportunitiesViewModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadView() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/author/opportunities?author_id=${encodeURIComponent(authorId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        view?: AuthorOpportunitiesViewModel;
        error?: string;
      };

      if (!response.ok || !payload.view) {
        throw new Error(payload.error ?? "load_failed");
      }

      setView(payload.view);
    } catch {
      setError("Не удалось загрузить возможности для авторов.");
      setView(null);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (!view && !loading) {
      void loadView();
    }
  }

  return (
    <div
      className="mt-6 overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fcfbfe]"
      data-author-opportunities-nested="true"
    >
      <button
        type="button"
        id="author-opportunities-nested-title"
        aria-expanded={expanded}
        aria-controls="author-opportunities-nested-panel"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <span className="min-w-0 break-words text-[15px] font-semibold text-[#2f2548]">
          Возможности для авторов
        </span>
        <NestedChevron expanded={expanded} />
      </button>

      {expanded ? (
        <div
          id="author-opportunities-nested-panel"
          className="border-t border-[#eadff8] px-4 pb-4 pt-4"
        >
          {loading && !view ? (
            <p className="text-sm text-[#7d70a2]">Загрузка возможностей…</p>
          ) : null}
          {error ? (
            <p className="text-sm text-[#9b3d3d]">{error}</p>
          ) : null}
          {view ? <AuthorOpportunitiesContent view={view} /> : null}
        </div>
      ) : null}
    </div>
  );
}
