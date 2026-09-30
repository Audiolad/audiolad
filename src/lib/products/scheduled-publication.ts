/**
 * Deferred publication for practices.
 *
 * Moderation still sets status = published. Public availability is computed:
 * approved/published AND (no schedule OR scheduled_publish_at <= now)
 * OR the product has already gone live (published_at <= now).
 *
 * scheduled_publish_at is timestamptz UTC. Europe/Moscow is UI-only.
 * published_at stays the actual first go-live and is not a schedule.
 * Until a write stamps it, effectivePublishedAt is that instant for products
 * that are already publicly available.
 */

export const PUBLICATION_TIME_ZONE = "Europe/Moscow";

export const PUBLICATION_MODE = {
  AFTER_APPROVAL: "after_approval",
  SCHEDULED: "scheduled",
} as const;

export type PublicationMode =
  (typeof PUBLICATION_MODE)[keyof typeof PUBLICATION_MODE];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

type MskParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function readMskParts(instant: Date): MskParts | null {
  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PUBLICATION_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) {
    return null;
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute,
  };
}

function mskWallClockAsUtcGuess(date: string, time: string): Date | null {
  const dateMatch = DATE_RE.exec(date);
  const timeMatch = TIME_RE.exec(time);
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    year < 2020 ||
    year > 2100
  ) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

/**
 * Interpret a calendar date and clock time as Moscow civil time and return UTC.
 * Uses Intl, not a fixed UTC+3 offset.
 */
export function mskWallClockToUtcIso(date: string, time: string): string | null {
  const utcGuess = mskWallClockAsUtcGuess(date.trim(), time.trim());
  if (!utcGuess) {
    return null;
  }

  const rendered = readMskParts(utcGuess);
  if (!rendered) {
    return null;
  }

  const renderedAsUtc = Date.UTC(
    Number(rendered.year),
    Number(rendered.month) - 1,
    Number(rendered.day),
    Number(rendered.hour),
    Number(rendered.minute),
    0,
    0,
  );
  const offsetMs = renderedAsUtc - utcGuess.getTime();
  const utc = new Date(utcGuess.getTime() - offsetMs);
  const check = readMskParts(utc);
  if (!check) {
    return null;
  }

  const [year, month, day] = date.trim().split("-");
  const [hour, minute] = time.trim().split(":");
  if (
    check.year !== year ||
    check.month !== month ||
    check.day !== day ||
    check.hour !== hour ||
    check.minute !== minute
  ) {
    return null;
  }

  return utc.toISOString();
}

export function utcIsoToMskFields(
  iso: string | null | undefined,
): { date: string; time: string } | null {
  if (!iso) {
    return null;
  }

  const parts = readMskParts(new Date(iso));
  if (!parts) {
    return null;
  }

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

export function formatMskPublicationStamp(
  iso: string | null | undefined,
  options?: { withYear?: boolean },
): string | null {
  if (!iso) {
    return null;
  }

  const parts = readMskParts(new Date(iso));
  if (!parts) {
    return null;
  }

  const month = MONTHS_GENITIVE[Number(parts.month) - 1];
  if (!month) {
    return null;
  }

  const day = String(Number(parts.day));
  const clock = `${parts.hour}:${parts.minute}`;
  const withYear = options?.withYear !== false;

  if (withYear) {
    return `${day} ${month} ${parts.year}, ${clock} МСК`;
  }

  return `${day} ${month} в ${clock} МСК`;
}

export function isPracticePubliclyAvailable(input: {
  status: string | null | undefined;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  now?: Date;
}): boolean {
  if (input.status !== "published") {
    return false;
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const publishedMs =
    typeof input.publishedAt === "string" && input.publishedAt.trim()
      ? Date.parse(input.publishedAt)
      : Number.NaN;

  if (Number.isFinite(publishedMs) && publishedMs <= nowMs) {
    return true;
  }

  if (input.scheduledPublishAt == null || input.scheduledPublishAt.trim() === "") {
    return true;
  }

  const scheduledMs = Date.parse(input.scheduledPublishAt);
  if (!Number.isFinite(scheduledMs)) {
    return false;
  }

  return scheduledMs <= nowMs;
}

function parseInstant(value: string | null | undefined): number {
  if (typeof value !== "string" || value.trim() === "") {
    return Number.NaN;
  }

  return Date.parse(value);
}

/**
 * Factual first public go-live for a product that is already available.
 *
 * published_at wins when it is already in the past. That covers an approval
 * that happens after the schedule: the approval write stamps now(), and the
 * product must not sort as if it had been public on the old schedule date.
 *
 * When status is published, the schedule is due, and published_at was never
 * stamped, the schedule itself is the go-live. A future schedule is not a
 * publish date.
 */
export function effectivePublishedAt(input: {
  status?: string | null;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  now?: Date;
}): string | null {
  const nowMs = (input.now ?? new Date()).getTime();
  const publishedMs = parseInstant(input.publishedAt);

  if (Number.isFinite(publishedMs) && publishedMs <= nowMs) {
    return input.publishedAt?.trim() || null;
  }

  const scheduledMs = parseInstant(input.scheduledPublishAt);
  if (
    input.status === "published" &&
    Number.isFinite(scheduledMs) &&
    scheduledMs <= nowMs &&
    !Number.isFinite(publishedMs)
  ) {
    return input.scheduledPublishAt?.trim() || null;
  }

  return null;
}

/** Newest public release first. Falls back to created_at only when there is no go-live. */
export function publicReleaseSortTimestamp(input: {
  status?: string | null;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  now?: Date;
}): number {
  const effective = effectivePublishedAt(input);
  const releaseMs = parseInstant(effective);
  if (Number.isFinite(releaseMs)) {
    return releaseMs;
  }

  const createdMs = parseInstant(input.createdAt);
  if (Number.isFinite(createdMs)) {
    return createdMs;
  }

  return 0;
}

/** Later of the last edit and the factual go-live, for sitemap lastmod. */
export function resolvePracticePublicLastModified(input: {
  updatedAt?: string | null;
  createdAt?: string | null;
  status?: string | null;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  now?: Date;
}): string | null {
  const candidates = [
    input.updatedAt,
    effectivePublishedAt(input),
    input.createdAt,
  ];
  let best: { ms: number; iso: string } | null = null;

  for (const candidate of candidates) {
    const ms = parseInstant(candidate);
    if (!Number.isFinite(ms)) {
      continue;
    }

    if (!best || ms > best.ms) {
      best = { ms, iso: candidate?.trim() ?? "" };
    }
  }

  return best?.iso || null;
}

export function hasPendingPublicationSchedule(input: {
  status: string | null | undefined;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  now?: Date;
}): boolean {
  if (!input.scheduledPublishAt) {
    return false;
  }

  return !isPracticePubliclyAvailable(input);
}

export function authorPublicationScheduleLine(input: {
  status: string | null | undefined;
  moderationStatus?: string | null;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  now?: Date;
}): string | null {
  if (!input.scheduledPublishAt) {
    return null;
  }

  if (
    isPracticePubliclyAvailable({
      status: input.status,
      scheduledPublishAt: input.scheduledPublishAt,
      publishedAt: input.publishedAt,
      now: input.now,
    })
  ) {
    return null;
  }

  const when = formatMskPublicationStamp(input.scheduledPublishAt, {
    withYear: false,
  });
  if (!when) {
    return null;
  }

  const approved =
    input.status === "published" || input.moderationStatus === "approved";

  if (approved) {
    return `Одобрено модератором · выйдет ${when}`;
  }

  return `Публикация запланирована на ${when}`;
}

export function adminScheduledPublicationLine(
  scheduledPublishAt: string | null | undefined,
): string | null {
  const stamp = formatMskPublicationStamp(scheduledPublishAt, { withYear: true });
  if (!stamp) {
    return null;
  }

  return `Запланированная публикация: ${stamp}`;
}

export function adminAwaitingPublicationLabel(input: {
  status: string | null | undefined;
  moderationStatus?: string | null;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  now?: Date;
}): string | null {
  if (input.status !== "published" || input.moderationStatus !== "approved") {
    return null;
  }

  if (
    isPracticePubliclyAvailable({
      status: input.status,
      scheduledPublishAt: input.scheduledPublishAt,
      publishedAt: input.publishedAt,
      now: input.now,
    })
  ) {
    return null;
  }

  return "Одобрено · ожидает публикации";
}

/**
 * PostgREST filter: published rows that are already publicly available.
 * AND this with status = published. Multiple .or() calls are appended.
 */
export function practicePublicAvailabilityOrFilter(now: Date = new Date()): string {
  const quoted = `"${now.toISOString()}"`;
  return `published_at.lte.${quoted},scheduled_publish_at.is.null,scheduled_publish_at.lte.${quoted}`;
}

export function applyPracticePublicAvailabilityFilter<T>(
  query: T,
  now: Date = new Date(),
): T {
  const builder = query as { or: (filters: string) => T };
  return builder.or(practicePublicAvailabilityOrFilter(now));
}
