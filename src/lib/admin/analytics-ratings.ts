/**
 * Admin Ratings analytics (Stage 3) — pure helpers.
 *
 * Temporal membership for rating windows uses practice_ratings.created_at
 * (FIRST rating timestamp). It does NOT use practice_rating_events.occurred_at.
 *
 * Example A: created yesterday, now stars=5 → in 7d and 30d with contribution 5.
 * Example B: created a year ago, edited today to 5 → all-time contribution 5;
 *            NOT in the 7d or 30d first-rating cohort.
 *
 * Public aggregate remains totalStars + ratingCount. Internal average is
 * admin-only and must guard divide-by-zero. Aggregates count only
 * excluded_at IS NULL rows unless a surface is explicitly labelled excluded.
 */

export const ADMIN_RATINGS_JOURNAL_PAGE_SIZE = 50;

export type AdminRatingsPeriod = "7d" | "30d" | "all";
export type AdminRatingsTab = "products" | "authors" | "journal";
export type AdminRatingsEventKind = "first" | "changed";
export type AdminRatingsExcludedFilter = "all" | "included" | "excluded";

export type AdminRatingFact = {
  userId: string;
  practiceId: string;
  authorId: string | null;
  stars: number;
  createdAt: string;
  excludedAt?: string | null;
};

export type AdminEligibleFact = {
  userId: string;
  practiceId: string;
  authorId?: string | null;
  ratingEligibleAt: string;
};

export type AdminRatingEventFact = {
  id: string;
  occurredAt: string;
  oldStars: number | null;
  newStars: number;
  userId: string;
  practiceId: string;
};

export type AdminRatingsWindow = {
  from: string | null;
  to: string | null;
};

export function parseAdminRatingsPeriod(
  value: string | null | undefined,
): AdminRatingsPeriod {
  if (value === "7d" || value === "30d" || value === "all") {
    return value;
  }
  return "all";
}

export function isActiveAdminRating(row: { excludedAt?: string | null }): boolean {
  return row.excludedAt == null;
}

/**
 * Window membership is FIRST-rating time (created_at), never event.occurred_at.
 * `from` inclusive, `to` exclusive when present. Null from/to = all-time.
 */
export function isCreatedAtInAdminRatingsWindow(
  createdAt: string,
  window: AdminRatingsWindow,
): boolean {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) {
    return false;
  }

  if (window.from) {
    const fromMs = Date.parse(window.from);
    if (Number.isFinite(fromMs) && createdMs < fromMs) {
      return false;
    }
  }

  if (window.to) {
    const toMs = Date.parse(window.to);
    if (Number.isFinite(toMs) && createdMs >= toMs) {
      return false;
    }
  }

  return true;
}

export function adminAverageStars(
  totalStars: number,
  ratingCount: number,
): number | null {
  if (ratingCount <= 0) {
    return null;
  }
  return totalStars / ratingCount;
}

export function formatAdminAverageStars(average: number | null): string {
  if (average == null || !Number.isFinite(average)) {
    return "—";
  }
  return average.toLocaleString("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

export function adminEligibleConversion(
  ratedEligible: number,
  eligible: number,
): number | null {
  if (eligible <= 0) {
    return null;
  }
  return ratedEligible / eligible;
}

export function formatAdminConversion(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) {
    return "—";
  }
  return `${Math.round(ratio * 100)}%`;
}

export function classifyAdminRatingEventKind(
  oldStars: number | null | undefined,
): AdminRatingsEventKind {
  return oldStars == null ? "first" : "changed";
}

export type AdminRatingsSummaryCounts = {
  ratingCount: number;
  totalStars: number;
  uniqueRaters: number;
  average: number | null;
  eligibleListeners: number;
  eligibleUnrated: number;
  ratedEligible: number;
  conversion: number | null;
  activeCount: number;
  excludedCount: number;
};

export function summarizeAdminRatings(input: {
  ratings: AdminRatingFact[];
  eligible: AdminEligibleFact[];
  window: AdminRatingsWindow;
}): AdminRatingsSummaryCounts {
  const active = input.ratings.filter(isActiveAdminRating);
  const windowed = active.filter((row) =>
    isCreatedAtInAdminRatingsWindow(row.createdAt, input.window),
  );

  let totalStars = 0;
  const raters = new Set<string>();
  for (const row of windowed) {
    totalStars += row.stars;
    raters.add(row.userId);
  }

  const eligiblePairs = input.eligible.filter((row) =>
    isCreatedAtInAdminRatingsWindow(row.ratingEligibleAt, input.window),
  );
  const activeKeys = new Set(
    active.map((row) => `${row.userId}:${row.practiceId}`),
  );

  let ratedEligible = 0;
  for (const pair of eligiblePairs) {
    if (activeKeys.has(`${pair.userId}:${pair.practiceId}`)) {
      ratedEligible += 1;
    }
  }

  const eligibleListeners = eligiblePairs.length;
  const eligibleUnrated = eligibleListeners - ratedEligible;

  return {
    ratingCount: windowed.length,
    totalStars,
    uniqueRaters: raters.size,
    average: adminAverageStars(totalStars, windowed.length),
    eligibleListeners,
    eligibleUnrated,
    ratedEligible,
    conversion: adminEligibleConversion(ratedEligible, eligibleListeners),
    activeCount: active.length,
    excludedCount: input.ratings.length - active.length,
  };
}

export type AdminRatingsProductAgg = {
  practiceId: string;
  totalStars: number;
  ratingCount: number;
  average: number | null;
  stars7d: number;
  count7d: number;
  stars30d: number;
  count30d: number;
  eligibleListeners: number;
  ratedEligible: number;
  conversion: number | null;
};

export function aggregateAdminRatingsByProduct(input: {
  ratings: AdminRatingFact[];
  eligible: AdminEligibleFact[];
  window7d: AdminRatingsWindow;
  window30d: AdminRatingsWindow;
}): AdminRatingsProductAgg[] {
  const active = input.ratings.filter(isActiveAdminRating);
  const byPractice = new Map<string, AdminRatingsProductAgg>();

  function ensure(practiceId: string): AdminRatingsProductAgg {
    const current = byPractice.get(practiceId);
    if (current) return current;
    const created: AdminRatingsProductAgg = {
      practiceId,
      totalStars: 0,
      ratingCount: 0,
      average: null,
      stars7d: 0,
      count7d: 0,
      stars30d: 0,
      count30d: 0,
      eligibleListeners: 0,
      ratedEligible: 0,
      conversion: null,
    };
    byPractice.set(practiceId, created);
    return created;
  }

  for (const row of active) {
    const agg = ensure(row.practiceId);
    agg.totalStars += row.stars;
    agg.ratingCount += 1;
    if (isCreatedAtInAdminRatingsWindow(row.createdAt, input.window7d)) {
      agg.stars7d += row.stars;
      agg.count7d += 1;
    }
    if (isCreatedAtInAdminRatingsWindow(row.createdAt, input.window30d)) {
      agg.stars30d += row.stars;
      agg.count30d += 1;
    }
  }

  const activeKeys = new Set(
    active.map((row) => `${row.userId}:${row.practiceId}`),
  );

  for (const pair of input.eligible) {
    const agg = ensure(pair.practiceId);
    agg.eligibleListeners += 1;
    if (activeKeys.has(`${pair.userId}:${pair.practiceId}`)) {
      agg.ratedEligible += 1;
    }
  }

  for (const agg of byPractice.values()) {
    agg.average = adminAverageStars(agg.totalStars, agg.ratingCount);
    agg.conversion = adminEligibleConversion(
      agg.ratedEligible,
      agg.eligibleListeners,
    );
  }

  return [...byPractice.values()].sort((a, b) => {
    if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
    return a.practiceId.localeCompare(b.practiceId);
  });
}

export type AdminRatingsAuthorAgg = {
  authorId: string;
  totalStars: number;
  ratingCount: number;
  average: number | null;
  uniqueRaters: number;
  stars7d: number;
  count7d: number;
  stars30d: number;
  count30d: number;
  ratingBearingProducts: number;
};

export function aggregateAdminRatingsByAuthor(input: {
  ratings: AdminRatingFact[];
  window7d: AdminRatingsWindow;
  window30d: AdminRatingsWindow;
}): AdminRatingsAuthorAgg[] {
  const active = input.ratings.filter(
    (row) => isActiveAdminRating(row) && row.authorId,
  );
  const byAuthor = new Map<
    string,
    AdminRatingsAuthorAgg & { raters: Set<string>; products: Set<string> }
  >();

  function ensure(authorId: string) {
    const current = byAuthor.get(authorId);
    if (current) return current;
    const created = {
      authorId,
      totalStars: 0,
      ratingCount: 0,
      average: null,
      uniqueRaters: 0,
      stars7d: 0,
      count7d: 0,
      stars30d: 0,
      count30d: 0,
      ratingBearingProducts: 0,
      raters: new Set<string>(),
      products: new Set<string>(),
    };
    byAuthor.set(authorId, created);
    return created;
  }

  for (const row of active) {
    const authorId = row.authorId;
    if (!authorId) continue;
    const agg = ensure(authorId);
    agg.totalStars += row.stars;
    agg.ratingCount += 1;
    agg.raters.add(row.userId);
    agg.products.add(row.practiceId);
    if (isCreatedAtInAdminRatingsWindow(row.createdAt, input.window7d)) {
      agg.stars7d += row.stars;
      agg.count7d += 1;
    }
    if (isCreatedAtInAdminRatingsWindow(row.createdAt, input.window30d)) {
      agg.stars30d += row.stars;
      agg.count30d += 1;
    }
  }

  return [...byAuthor.values()]
    .map((row) => ({
      authorId: row.authorId,
      totalStars: row.totalStars,
      ratingCount: row.ratingCount,
      average: adminAverageStars(row.totalStars, row.ratingCount),
      uniqueRaters: row.raters.size,
      stars7d: row.stars7d,
      count7d: row.count7d,
      stars30d: row.stars30d,
      count30d: row.count30d,
      ratingBearingProducts: row.products.size,
    }))
    .sort((a, b) => {
      if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
      return a.authorId.localeCompare(b.authorId);
    });
}

export function compareAdminRatingEventsDesc(
  a: AdminRatingEventFact,
  b: AdminRatingEventFact,
): number {
  const aMs = Date.parse(a.occurredAt);
  const bMs = Date.parse(b.occurredAt);
  if (bMs !== aMs) return bMs - aMs;
  return b.id.localeCompare(a.id);
}

export function paginateStable<T>(
  rows: T[],
  limit: number,
  offset: number,
): T[] {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safeOffset = Math.max(0, offset);
  return rows.slice(safeOffset, safeOffset + safeLimit);
}

export const ADMIN_RATINGS_DIAGNOSTIC_LABELS = {
  burst_new_ratings: "Повышенная активность",
  shared_ip_signal: "Совпадающий IP-сигнал",
  shared_device_signal: "Совпадающий device-сигнал",
  mass_product: "Повышенная активность",
  mass_author: "Повышенная активность",
  short_registration_path: "Повышенная активность",
} as const;

export type AdminRatingsDiagnosticKind =
  keyof typeof ADMIN_RATINGS_DIAGNOSTIC_LABELS;

export type AdminRatingsDiagnosticObservation = {
  kind: AdminRatingsDiagnosticKind;
  label: string;
  detail: string;
  count: number;
};

export const ADMIN_RATINGS_DIAGNOSTIC_THRESHOLDS = {
  burstWindowMs: 15 * 60 * 1000,
  burstMinRatings: 8,
  sharedSignalMinUsers: 3,
  massProduct24h: 10,
  massAuthor24h: 15,
  shortPathMs: 10 * 60 * 1000,
} as const;

/**
 * Observe-only anomaly hints. Neutral wording only — never «fraud».
 * Does not exclude or block anything.
 */
export function observeAdminRatingDiagnostics(input: {
  nowMs: number;
  ratings: Array<
    AdminRatingFact & {
      voteIpHmac?: string | null;
      deviceIdHmac?: string | null;
    }
  >;
  eligible?: Array<
    AdminEligibleFact & {
      registeredAt?: string | null;
    }
  >;
}): AdminRatingsDiagnosticObservation[] {
  const observations: AdminRatingsDiagnosticObservation[] = [];
  const active = input.ratings.filter(isActiveAdminRating);
  const burstFrom = input.nowMs - ADMIN_RATINGS_DIAGNOSTIC_THRESHOLDS.burstWindowMs;
  const dayFrom = input.nowMs - 24 * 60 * 60 * 1000;

  const burst = active.filter((row) => Date.parse(row.createdAt) >= burstFrom);
  if (burst.length >= ADMIN_RATINGS_DIAGNOSTIC_THRESHOLDS.burstMinRatings) {
    observations.push({
      kind: "burst_new_ratings",
      label: ADMIN_RATINGS_DIAGNOSTIC_LABELS.burst_new_ratings,
      detail: `${burst.length} новых оценок за последние 15 минут`,
      count: burst.length,
    });
  }

  function collectShared(
    key: "voteIpHmac" | "deviceIdHmac",
    kind: "shared_ip_signal" | "shared_device_signal",
    noun: string,
  ) {
    const groups = new Map<string, Set<string>>();
    for (const row of active) {
      const signal = row[key]?.trim();
      if (!signal) continue;
      const users = groups.get(signal) ?? new Set<string>();
      users.add(row.userId);
      groups.set(signal, users);
    }
    let flagged = 0;
    let maxUsers = 0;
    for (const users of groups.values()) {
      if (users.size >= ADMIN_RATINGS_DIAGNOSTIC_THRESHOLDS.sharedSignalMinUsers) {
        flagged += 1;
        maxUsers = Math.max(maxUsers, users.size);
      }
    }
    if (flagged > 0) {
      observations.push({
        kind,
        label: ADMIN_RATINGS_DIAGNOSTIC_LABELS[kind],
        detail: `${flagged} ${noun} на ${maxUsers} и более аккаунтов`,
        count: flagged,
      });
    }
  }

  collectShared("voteIpHmac", "shared_ip_signal", "IP-сигналов");
  collectShared("deviceIdHmac", "shared_device_signal", "device-сигналов");

  const product24h = new Map<string, number>();
  const author24h = new Map<string, number>();
  for (const row of active) {
    if (Date.parse(row.createdAt) < dayFrom) continue;
    product24h.set(row.practiceId, (product24h.get(row.practiceId) ?? 0) + 1);
    if (row.authorId) {
      author24h.set(row.authorId, (author24h.get(row.authorId) ?? 0) + 1);
    }
  }

  let massProducts = 0;
  let maxProduct = 0;
  for (const count of product24h.values()) {
    if (count >= ADMIN_RATINGS_DIAGNOSTIC_THRESHOLDS.massProduct24h) {
      massProducts += 1;
      maxProduct = Math.max(maxProduct, count);
    }
  }
  if (massProducts > 0) {
    observations.push({
      kind: "mass_product",
      label: ADMIN_RATINGS_DIAGNOSTIC_LABELS.mass_product,
      detail: `${massProducts} продукт(ов) с ${maxProduct}+ оценками за 24 часа`,
      count: massProducts,
    });
  }

  let massAuthors = 0;
  let maxAuthor = 0;
  for (const count of author24h.values()) {
    if (count >= ADMIN_RATINGS_DIAGNOSTIC_THRESHOLDS.massAuthor24h) {
      massAuthors += 1;
      maxAuthor = Math.max(maxAuthor, count);
    }
  }
  if (massAuthors > 0) {
    observations.push({
      kind: "mass_author",
      label: ADMIN_RATINGS_DIAGNOSTIC_LABELS.mass_author,
      detail: `${massAuthors} автор(ов) с ${maxAuthor}+ оценками за 24 часа`,
      count: massAuthors,
    });
  }

  if (input.eligible) {
    const ratingByPair = new Map<string, AdminRatingFact>();
    for (const row of active) {
      ratingByPair.set(`${row.userId}:${row.practiceId}`, row);
    }
    let shortPath = 0;
    for (const pair of input.eligible) {
      if (!pair.registeredAt) continue;
      const rating = ratingByPair.get(`${pair.userId}:${pair.practiceId}`);
      if (!rating) continue;
      const registeredMs = Date.parse(pair.registeredAt);
      const eligibleMs = Date.parse(pair.ratingEligibleAt);
      const ratedMs = Date.parse(rating.createdAt);
      if (
        !Number.isFinite(registeredMs) ||
        !Number.isFinite(eligibleMs) ||
        !Number.isFinite(ratedMs)
      ) {
        continue;
      }
      if (
        ratedMs - registeredMs <= ADMIN_RATINGS_DIAGNOSTIC_THRESHOLDS.shortPathMs &&
        eligibleMs >= registeredMs &&
        ratedMs >= eligibleMs
      ) {
        shortPath += 1;
      }
    }
    if (shortPath > 0) {
      observations.push({
        kind: "short_registration_path",
        label: ADMIN_RATINGS_DIAGNOSTIC_LABELS.short_registration_path,
        detail: `${shortPath} пар регистрация→eligibility→оценка быстрее 10 минут`,
        count: shortPath,
      });
    }
  }

  return observations;
}

export const ADMIN_RATINGS_PRODUCT_SORTS = [
  "total_stars",
  "rating_count",
  "stars_30d",
  "stars_7d",
  "conversion",
] as const;

export type AdminRatingsProductSort =
  (typeof ADMIN_RATINGS_PRODUCT_SORTS)[number];

export function parseAdminRatingsProductSort(
  value: string | null | undefined,
): AdminRatingsProductSort {
  if (
    value === "rating_count" ||
    value === "stars_30d" ||
    value === "stars_7d" ||
    value === "conversion"
  ) {
    return value;
  }
  return "total_stars";
}

export const ADMIN_RATINGS_AUTHOR_SORTS = [
  "total_stars",
  "rating_count",
  "stars_30d",
  "stars_7d",
  "unique_raters",
] as const;

export type AdminRatingsAuthorSort =
  (typeof ADMIN_RATINGS_AUTHOR_SORTS)[number];

export function parseAdminRatingsAuthorSort(
  value: string | null | undefined,
): AdminRatingsAuthorSort {
  if (
    value === "rating_count" ||
    value === "stars_30d" ||
    value === "stars_7d" ||
    value === "unique_raters"
  ) {
    return value;
  }
  return "total_stars";
}

export type AdminRatingsSummaryBundle = {
  period: AdminRatingsPeriod;
  periodLabel: string;
  generatedAt: string;
  ratingCount: number;
  totalStars: number;
  uniqueRaters: number;
  average: number | null;
  averageFormatted: string;
  eligibleListeners: number;
  eligibleUnrated: number;
  ratedEligible: number;
  conversion: number | null;
  conversionFormatted: string;
  activeCount: number;
  excludedCount: number;
  notes: {
    temporal: string;
    average: string;
    excluded: string;
    diagnostics: string;
    journal: string;
  };
};

export type AdminRatingsProductRow = {
  practiceId: string;
  title: string;
  productKind: "practice" | "music" | "audio_post";
  authorId: string | null;
  authorName: string;
  authorSlug: string | null;
  href: string | null;
  totalStars: number;
  ratingCount: number;
  average: number | null;
  averageFormatted: string;
  stars7d: number;
  count7d: number;
  stars30d: number;
  count30d: number;
  eligibleListeners: number;
  ratedEligible: number;
  conversion: number | null;
  conversionFormatted: string;
};

export type AdminRatingsAuthorRow = {
  authorId: string;
  authorName: string;
  authorSlug: string | null;
  href: string | null;
  totalStars: number;
  ratingCount: number;
  average: number | null;
  averageFormatted: string;
  uniqueRaters: number;
  stars7d: number;
  count7d: number;
  stars30d: number;
  count30d: number;
  ratingBearingProducts: number;
};

export type AdminRatingsBreakdownBundle = {
  products: {
    total: number;
    rows: AdminRatingsProductRow[];
    sort: AdminRatingsProductSort;
    sortDir: "asc" | "desc";
    error: string | null;
  };
  authors: {
    total: number;
    rows: AdminRatingsAuthorRow[];
    sort: AdminRatingsAuthorSort;
    sortDir: "asc" | "desc";
    error: string | null;
  };
};

export type AdminRatingsEventRow = {
  id: string;
  occurredAt: string;
  oldStars: number | null;
  newStars: number;
  eventKind: AdminRatingsEventKind;
  userId: string;
  listenerLabel: string;
  practiceId: string;
  title: string;
  href: string | null;
  authorId: string | null;
  authorName: string;
  excluded: boolean;
  excludedReason: string | null;
};

export type AdminRatingsEventsBundle = {
  total: number;
  limit: number;
  offset: number;
  rows: AdminRatingsEventRow[];
  error: string | null;
};

export type AdminRatingsExcludedRow = {
  id: string;
  userId: string;
  practiceId: string;
  stars: number;
  createdAt: string;
  excludedAt: string;
  excludedReason: string | null;
  title: string;
  authorName: string;
};

export type AdminRatingsDiagnosticsBundle = {
  attention: boolean;
  observations: AdminRatingsDiagnosticObservation[];
  excluded: {
    total: number;
    rows: AdminRatingsExcludedRow[];
  };
  notes: {
    diagnostics: string;
    excluded: string;
  };
};
