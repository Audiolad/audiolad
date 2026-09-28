/**
 * Query-only updates for statistics tables.
 *
 * `router.replace` / `router.push` are App Router navigations. On these
 * pages that refetches the server page (admin overview reads searchParams
 * and has `loading.tsx`; the author cabinet page is force-dynamic). In
 * production that scroll-resets to the top for the round trip, then the
 * previous position comes back when the payload lands.
 *
 * The History API is the App Router equivalent of `{ scroll: false }` that
 * does not start that navigation. Next.js patches `pushState` / `replaceState`
 * and syncs `useSearchParams` from them. `replaceState` keeps today's sort
 * history: the current entry is overwritten, so Back leaves the page.
 * `pushState` keeps today's filter history: Back returns to the previous
 * filter. Neither call scrolls.
 */

export type StatsQueryHistory = {
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
  pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
};

export function statsQueryHref(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function replaceStatsQuery(href: string, history: StatsQueryHistory): void {
  history.replaceState(null, "", href);
}

export function pushStatsQuery(href: string, history: StatsQueryHistory): void {
  history.pushState(null, "", href);
}

export function isPlainPrimaryClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Fields the admin overview server page actually reads. Sort, search, Top N,
 * and breakdown tabs are client-fetched and must not refresh that page.
 */
export type AdminSummaryQuery = {
  period: string;
  includeTest: boolean;
  authorId: string | null;
  practiceId: string | null;
  utmSource: string | null;
  deviceType: string | null;
};

function summaryField(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function adminSummaryQueryKey(query: AdminSummaryQuery): string {
  return [
    query.period,
    query.includeTest ? "1" : "0",
    summaryField(query.authorId),
    summaryField(query.practiceId),
    summaryField(query.utmSource),
    summaryField(query.deviceType),
  ].join("|");
}

export function adminSummaryNeedsRefresh(
  rendered: AdminSummaryQuery,
  url: AdminSummaryQuery,
): boolean {
  return adminSummaryQueryKey(rendered) !== adminSummaryQueryKey(url);
}

/**
 * After the first paint, keep the table (and the author mobile sort select)
 * mounted while the next sort/filter fetch runs. Replacing it with a
 * one-line loading message collapses the page and the browser clamps scroll.
 */
export function shouldReplaceStatsTableWithLoading(
  hasDisplayedResult: boolean,
): boolean {
  return !hasDisplayedResult;
}

export function applyAuthorStatsSearchPatch(
  current: URLSearchParams,
  next: {
    author?: string;
    period?: string;
    sort?: string | null;
    order?: "asc" | "desc" | null;
  },
): URLSearchParams {
  const params = new URLSearchParams(current.toString());
  if (next.author) params.set("author", next.author);
  if (next.period) params.set("period", next.period);
  if (next.sort !== undefined) {
    if (!next.sort || next.sort === "views") params.delete("sort");
    else params.set("sort", next.sort);
  }
  if (next.order !== undefined) {
    if (!next.order || next.order === "desc") params.delete("order");
    else params.set("order", next.order);
  }
  return params;
}
