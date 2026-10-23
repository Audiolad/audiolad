"use client";

import { useEffect, useState, type ReactNode } from "react";

export function BusinessCaseCollapsible({
  caseId,
  applicantName,
  statusLabel,
  submittedLabel,
  workspaceCountLabel,
  isOwnCase,
  defaultExpanded,
  children,
}: {
  caseId: string;
  applicantName: string;
  statusLabel: string;
  submittedLabel: string;
  workspaceCountLabel: string;
  isOwnCase: boolean;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  useEffect(() => {
    const expandFromHash = () => {
      if (window.location.hash === `#case-${caseId}`) setExpanded(true);
    };
    expandFromHash();
    window.addEventListener("hashchange", expandFromHash);
    return () => window.removeEventListener("hashchange", expandFromHash);
  }, [caseId]);

  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`case-body-${caseId}`}
        data-testid="business-verification-case-toggle"
        onClick={() => setExpanded((value) => !value)}
        className="relative flex min-h-11 w-full min-w-0 flex-col justify-center gap-1 rounded-xl pr-8 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7042c5] focus-visible:ring-offset-2 md:flex-row md:items-center md:gap-3"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex-1 md:flex-nowrap">
          <span className="min-w-0 font-semibold md:truncate" title={applicantName}>{applicantName}</span>
          <span className="whitespace-nowrap rounded-full bg-[#f3edfb] px-3 py-1 text-xs font-semibold text-[#7042c5]">{statusLabel}</span>
          {isOwnCase ? (
            <span className="whitespace-nowrap rounded-full bg-[#fff1e0] px-3 py-1 text-xs font-semibold text-[#9a5a00]">Ваш аккаунт</span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#796ba0] md:shrink-0 md:flex-nowrap md:whitespace-nowrap">
          <span>Отправлено: {submittedLabel}</span>
          <span>{workspaceCountLabel}</span>
        </span>
        <span className="sr-only">{expanded ? "Свернуть заявку" : "Развернуть заявку"}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7042c5] motion-safe:transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={`case-body-${caseId}`} data-testid="business-verification-case-body" hidden={!expanded} inert={!expanded}>
        <div className="mt-4 border-t border-[#efe6fa] pt-4">{children}</div>
      </div>
    </>
  );
}
