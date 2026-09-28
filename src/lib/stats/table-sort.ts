/**
 * One sort contract for Audiolad statistics tables.
 * The browser only sends a whitelisted key and direction.
 * PostgreSQL applies that order to the filtered set, then LIMIT.
 * Author-cabinet products are sorted on the server after listening and
 * appreciation are attached, because those fields are not in the products RPC.
 */

export type SortOrder = "asc" | "desc";

export type SortValueKind = "text" | "number" | "duration" | "date";

export type SortValue = string | number | null;

/** Safety cap for an explicit «Все» slice. Sort still happens before this cut. */
export const STATS_TABLE_ROW_CAP = 5000;

export function defaultSortOrder(kind: SortValueKind): SortOrder {
  return kind === "text" ? "asc" : "desc";
}

export function parseSortOrder(
  value: string | null | undefined,
  fallback: SortOrder = "desc",
): SortOrder {
  return value === "asc" || value === "desc" ? value : fallback;
}

export function nextColumnSort<Key extends string>(
  current: { sort: Key; order: SortOrder },
  clicked: Key,
  kind: SortValueKind,
): { sort: Key; order: SortOrder } {
  if (current.sort === clicked) {
    return {
      sort: clicked,
      order: current.order === "asc" ? "desc" : "asc",
    };
  }
  return { sort: clicked, order: defaultSortOrder(kind) };
}

function isEmptySortValue(value: SortValue): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  return false;
}

function comparePresent(
  left: SortValue,
  right: SortValue,
  kind: SortValueKind,
): number {
  if (kind === "text") {
    return String(left).localeCompare(String(right), "ru", {
      sensitivity: "base",
      numeric: true,
    });
  }
  if (kind === "date") {
    const leftMs = Date.parse(String(left));
    const rightMs = Date.parse(String(right));
    const leftOk = Number.isFinite(leftMs);
    const rightOk = Number.isFinite(rightMs);
    if (!leftOk && !rightOk) return 0;
    if (!leftOk) return 1;
    if (!rightOk) return -1;
    return leftMs - rightMs;
  }
  return Number(left) - Number(right);
}

/**
 * NULLs and non-finite numbers stay last in both directions.
 * Equal primary values fall through to the caller’s tie-break.
 */
export function compareSortValues(
  left: SortValue,
  right: SortValue,
  order: SortOrder,
  kind: SortValueKind,
): number {
  const leftEmpty = isEmptySortValue(left);
  const rightEmpty = isEmptySortValue(right);
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  const delta = comparePresent(left, right, kind);
  return order === "asc" ? delta : -delta;
}

export type SortAccessors<Row> = {
  kind: SortValueKind;
  value: (row: Row) => SortValue;
  tieBreak: (row: Row) => string;
};

export function sortRows<Row>(
  rows: readonly Row[],
  accessors: SortAccessors<Row>,
  order: SortOrder,
): Row[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const primary = compareSortValues(
        accessors.value(left.row),
        accessors.value(right.row),
        order,
        accessors.kind,
      );
      if (primary !== 0) return primary;
      const tie = left.row
        ? accessors.tieBreak(left.row).localeCompare(accessors.tieBreak(right.row), "ru", {
            sensitivity: "base",
            numeric: true,
          })
        : 0;
      if (tie !== 0) return tie;
      return left.index - right.index;
    })
    .map((item) => item.row);
}

export function takeSortedSlice<Row>(rows: readonly Row[], limit: number | null): Row[] {
  if (limit == null) return [...rows];
  const size = Math.max(0, Math.floor(limit));
  return rows.slice(0, size);
}

export const ADMIN_PRACTICE_SORT_KEYS = [
  "title",
  "author",
  "views",
  "play_starts",
  "listeners",
  "completions",
  "listened_ms",
  "saves",
  "view_to_play",
  "play_to_complete",
] as const;

export type AdminPracticeSortKey = (typeof ADMIN_PRACTICE_SORT_KEYS)[number];

const ADMIN_PRACTICE_SORT_SET = new Set<string>(ADMIN_PRACTICE_SORT_KEYS);

const ADMIN_PRACTICE_SORT_ALIASES: Record<string, AdminPracticeSortKey> = {
  title: "title",
  practice: "title",
  author: "author",
  author_name: "author",
  views: "views",
  views_count: "views",
  starts: "play_starts",
  play_starts: "play_starts",
  starts_count: "play_starts",
  listeners: "listeners",
  listeners_count: "listeners",
  completion: "completions",
  completions: "completions",
  completion_count: "completions",
  listening_time: "listened_ms",
  listened_ms: "listened_ms",
  listening_seconds: "listened_ms",
  saves: "saves",
  view_to_play: "view_to_play",
  play_to_complete: "play_to_complete",
};

export function canonicalizeAdminPracticeSort(
  value: string | null | undefined,
): AdminPracticeSortKey {
  const key = value?.trim().toLowerCase() ?? "";
  const mapped = ADMIN_PRACTICE_SORT_ALIASES[key];
  if (mapped && ADMIN_PRACTICE_SORT_SET.has(mapped)) return mapped;
  return "play_starts";
}

export function adminPracticeSortKind(sort: AdminPracticeSortKey): SortValueKind {
  if (sort === "title" || sort === "author") return "text";
  if (sort === "listened_ms") return "duration";
  return "number";
}

/** Public URL alias. Internal RPC keys stay the SQL whitelist. */
export function adminPracticeSortParam(sort: AdminPracticeSortKey): string {
  if (sort === "listened_ms") return "listening_time";
  if (sort === "play_starts") return "starts";
  if (sort === "completions") return "completion";
  return sort;
}

export const ADMIN_AUTHOR_SORT_KEYS = [
  "name",
  "published_practices",
  "views",
  "play_starts",
  "listeners",
  "completions",
  "saves",
  "view_to_play",
  "play_to_complete",
] as const;

export type AdminAuthorSortKey = (typeof ADMIN_AUTHOR_SORT_KEYS)[number];

const ADMIN_AUTHOR_SORT_ALIASES: Record<string, AdminAuthorSortKey> = {
  name: "name",
  author: "name",
  title: "name",
  published_practices: "published_practices",
  views: "views",
  starts: "play_starts",
  play_starts: "play_starts",
  listeners: "listeners",
  completion: "completions",
  completions: "completions",
  saves: "saves",
  view_to_play: "view_to_play",
  play_to_complete: "play_to_complete",
};

export function canonicalizeAdminAuthorSort(
  value: string | null | undefined,
): AdminAuthorSortKey {
  const key = value?.trim().toLowerCase() ?? "";
  return ADMIN_AUTHOR_SORT_ALIASES[key] ?? "play_starts";
}

export function adminAuthorSortKind(sort: AdminAuthorSortKey): SortValueKind {
  return sort === "name" ? "text" : "number";
}

export const ADMIN_UTM_SORT_KEYS = [
  "group",
  "sessions",
  "visitors",
  "registrations",
  "play_starts",
  "listeners",
  "saves",
] as const;

export type AdminUtmSortKey = (typeof ADMIN_UTM_SORT_KEYS)[number];

const ADMIN_UTM_SORT_ALIASES: Record<string, AdminUtmSortKey> = {
  group: "group",
  label: "group",
  sessions: "sessions",
  visitors: "visitors",
  registrations: "registrations",
  starts: "play_starts",
  play_starts: "play_starts",
  listeners: "listeners",
  saves: "saves",
};

export function canonicalizeAdminUtmSort(
  value: string | null | undefined,
): AdminUtmSortKey {
  const key = value?.trim().toLowerCase() ?? "";
  return ADMIN_UTM_SORT_ALIASES[key] ?? "sessions";
}

export function adminUtmSortKind(sort: AdminUtmSortKey): SortValueKind {
  return sort === "group" ? "text" : "number";
}

export function clampStatsSearchQuery(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 200);
}
