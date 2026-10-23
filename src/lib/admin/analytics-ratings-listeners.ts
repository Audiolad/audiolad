/**
 * Admin «Оценки → Слушатели» (task 612f9c76) — pure helpers shared by the
 * server routes and the client panel. No Node-only imports here.
 *
 * Grain: one row per listener (auth user) with ≥1 practice_ratings row.
 * ratingCount = user×product pairs (UNIQUE), i.e. rated products.
 * average = current stars of NON-excluded ratings / their count (null when 0).
 *
 * PII rules: full name only when really stored (blank → null, shown honestly
 * as «ФИО не указано»); email from the auth source. HMAC / IP / device values
 * are never part of these DTOs — only neutral counts of other accounts.
 * Access: admin_panel.access + analytics.view + users.view (server-checked).
 * Nothing here excludes ratings or sanctions accounts.
 */

export const ADMIN_RATINGS_LISTENERS_PAGE_SIZE = 50;
export const ADMIN_RATINGS_LISTENERS_SEARCH_MAX = 120;
export const ADMIN_RATINGS_LISTENER_DETAIL_LIMIT = 200;

export const ADMIN_RATINGS_LISTENERS_REQUIRED_PERMISSIONS = [
  "admin_panel.access",
  "analytics.view",
  "users.view",
] as const;

export const ADMIN_RATINGS_LISTENERS_LIST_OPERATION = "admin_ratings_listeners_list_view";
export const ADMIN_RATINGS_LISTENER_DETAIL_OPERATION = "admin_ratings_listener_detail_view";

export const ADMIN_RATINGS_LISTENER_NO_NAME = "ФИО не указано";
export const ADMIN_RATINGS_LISTENER_NO_EMAIL = "email не найден";

export type AdminRatingsListenerSort =
  | "last_activity"
  | "rating_count"
  | "registered_at"
  | "average";

export type AdminRatingsListenerSortDir = "asc" | "desc";

export type AdminRatingsListenerRow = {
  userId: string;
  fullName: string | null;
  email: string | null;
  registeredAt: string | null;
  ratingCount: number;
  activeCount: number;
  excludedCount: number;
  average: number | null;
  firstRatedAt: string | null;
  lastActivityAt: string | null;
  isTest: boolean;
};

export type AdminRatingsListenersBundle = {
  total: number;
  limit: number;
  offset: number;
  sort: AdminRatingsListenerSort;
  sortDir: AdminRatingsListenerSortDir;
  rows: AdminRatingsListenerRow[];
};

export type AdminRatingsListenerRatingRow = {
  ratingId: string;
  practiceId: string;
  title: string;
  productKind: string | null;
  authorId: string | null;
  authorName: string;
  href: string | null;
  stars: number;
  createdAt: string | null;
  updatedAt: string | null;
  excluded: boolean;
  ratingEligibleAt: string | null;
  realListenedMs: number | null;
};

export type AdminRatingsListenerEventRow = {
  id: string;
  practiceId: string;
  title: string;
  oldStars: number | null;
  newStars: number;
  eventKind: "first" | "changed";
  occurredAt: string | null;
};

export type AdminRatingsListenerSignals = {
  sharedIpOtherAccounts: number;
  sharedDeviceOtherAccounts: number;
  fastRegistrationPaths: number;
};

export type AdminRatingsListenerDetailBundle =
  | { found: false }
  | {
      found: true;
      profile: {
        userId: string;
        fullName: string | null;
        email: string | null;
        registeredAt: string | null;
        hasProfile: boolean;
        isTest: boolean;
      };
      ratingTotal: number;
      eventTotal: number;
      limit: number;
      ratings: AdminRatingsListenerRatingRow[];
      events: AdminRatingsListenerEventRow[];
      signals: AdminRatingsListenerSignals;
    };

export type RatingsListenersAccessDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: "unauthorized" | "forbidden" };

/**
 * Pure RBAC decision. `hasPermission` must already treat the owner role as
 * all-permissions (snapshotHasPermission does). Analysts (no users.view) and
 * support (no analytics.view) are refused; listeners/authors have neither.
 */
export function evaluateRatingsListenersAccess(input: {
  userId: string | null | undefined;
  hasPermission: (permission: string) => boolean;
}): RatingsListenersAccessDecision {
  if (!input.userId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  for (const permission of ADMIN_RATINGS_LISTENERS_REQUIRED_PERMISSIONS) {
    if (!input.hasPermission(permission)) {
      return { ok: false, status: 403, error: "forbidden" };
    }
  }
  return { ok: true };
}

export function parseAdminRatingsListenerSort(
  value: string | null | undefined,
): AdminRatingsListenerSort {
  if (
    value === "rating_count" ||
    value === "registered_at" ||
    value === "average" ||
    value === "last_activity"
  ) {
    return value;
  }
  return "last_activity";
}

export function parseAdminRatingsListenerSortDir(
  value: string | null | undefined,
): AdminRatingsListenerSortDir {
  return value === "asc" ? "asc" : "desc";
}

export function parseAdminRatingsListenerOffset(value: string | null | undefined): number {
  if (!value || !/^\d{1,6}$/.test(value)) return 0;
  return Number(value);
}

export function normalizeAdminRatingsListenerSearch(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, ADMIN_RATINGS_LISTENERS_SEARCH_MAX);
  return trimmed === "" ? null : trimmed;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAdminRatingsListenerUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

export function formatAdminRatingsListenerName(fullName: string | null | undefined): string {
  const trimmed = typeof fullName === "string" ? fullName.trim() : "";
  return trimmed === "" ? ADMIN_RATINGS_LISTENER_NO_NAME : trimmed;
}

export function formatAdminRatingsStars(stars: number): string {
  const n = Math.max(0, Math.min(5, Math.round(stars)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export function formatAdminRatingsListenedMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} мин ${seconds} с` : `${seconds} с`;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNum(value: unknown): number | null {
  if (value == null) return null;
  const parsed = num(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Whitelists RPC keys: anything unexpected (e.g. a future hmac) is dropped. */
export function normalizeAdminRatingsListenersRpc(raw: unknown): AdminRatingsListenersBundle {
  const r = record(raw);
  const rows = Array.isArray(r.rows) ? r.rows : [];
  return {
    total: num(r.total),
    limit: num(r.limit, ADMIN_RATINGS_LISTENERS_PAGE_SIZE),
    offset: num(r.offset),
    sort: parseAdminRatingsListenerSort(text(r.sort)),
    sortDir: parseAdminRatingsListenerSortDir(text(r.sort_dir)),
    rows: rows.flatMap((item) => {
      const row = record(item);
      const userId = text(row.user_id);
      if (!userId) return [];
      return [
        {
          userId,
          fullName: text(row.full_name)?.trim() || null,
          email: text(row.email),
          registeredAt: text(row.registered_at),
          ratingCount: num(row.rating_count),
          activeCount: num(row.active_count),
          excludedCount: num(row.excluded_count),
          average: nullableNum(row.average),
          firstRatedAt: text(row.first_rated_at),
          lastActivityAt: text(row.last_activity_at),
          isTest: row.is_test === true,
        },
      ];
    }),
  };
}

export function normalizeAdminRatingsListenerDetailRpc(
  raw: unknown,
): AdminRatingsListenerDetailBundle {
  const r = record(raw);
  if (r.found !== true) return { found: false };
  const profile = record(r.profile);
  const signals = record(r.signals);
  const userId = text(profile.user_id);
  if (!userId) return { found: false };
  return {
    found: true,
    profile: {
      userId,
      fullName: text(profile.full_name)?.trim() || null,
      email: text(profile.email),
      registeredAt: text(profile.registered_at),
      hasProfile: profile.has_profile === true,
      isTest: profile.is_test === true,
    },
    ratingTotal: num(r.rating_total),
    eventTotal: num(r.event_total),
    limit: num(r.limit, ADMIN_RATINGS_LISTENER_DETAIL_LIMIT),
    ratings: (Array.isArray(r.ratings) ? r.ratings : []).flatMap((item) => {
      const row = record(item);
      const ratingId = text(row.rating_id);
      const practiceId = text(row.practice_id);
      if (!ratingId || !practiceId) return [];
      return [
        {
          ratingId,
          practiceId,
          title: text(row.title) ?? "Практика",
          productKind: text(row.product_kind),
          authorId: text(row.author_id),
          authorName: text(row.author_name) ?? "Автор",
          href: safeInternalHref(text(row.href)),
          stars: num(row.stars),
          createdAt: text(row.created_at),
          updatedAt: text(row.updated_at),
          excluded: row.excluded === true,
          ratingEligibleAt: text(row.rating_eligible_at),
          realListenedMs: nullableNum(row.real_listened_ms),
        },
      ];
    }),
    events: (Array.isArray(r.events) ? r.events : []).flatMap((item) => {
      const row = record(item);
      const id = text(row.id);
      const practiceId = text(row.practice_id);
      if (!id || !practiceId) return [];
      const oldStars = nullableNum(row.old_stars);
      return [
        {
          id,
          practiceId,
          title: text(row.title) ?? "Практика",
          oldStars,
          newStars: num(row.new_stars),
          eventKind: oldStars == null ? ("first" as const) : ("changed" as const),
          occurredAt: text(row.occurred_at),
        },
      ];
    }),
    signals: {
      sharedIpOtherAccounts: num(signals.shared_ip_other_accounts),
      sharedDeviceOtherAccounts: num(signals.shared_device_other_accounts),
      fastRegistrationPaths: num(signals.fast_registration_paths),
    },
  };
}

/** Only same-origin absolute paths are rendered as links. */
export function safeInternalHref(href: string | null): string | null {
  if (!href) return null;
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return null;
  return href;
}

/**
 * Neutral, non-accusatory wording for per-listener signals. Signals are
 * context for a human, never a verdict, and never trigger exclusion.
 */
/**
 * Neutral notice when the change history returned by the RPC is truncated
 * (events are capped at `limit`, newest first). Returns null when complete.
 */
export function describeAdminRatingsListenerEventsTruncation(detail: {
  eventTotal: number;
  events: readonly unknown[];
}): string | null {
  const shown = detail.events.length;
  const total = Number.isFinite(detail.eventTotal) ? detail.eventTotal : 0;
  if (total <= shown) {
    return null;
  }
  return `История неполная: показаны последние ${shown} из ${total} событий; более ранние изменения оценок здесь не отображаются.`;
}

export function describeAdminRatingsListenerSignals(
  signals: AdminRatingsListenerSignals,
): string[] {
  const out: string[] = [];
  if (signals.sharedIpOtherAccounts > 0) {
    out.push(
      `IP-сигнал при оценке совпадает ещё с ${signals.sharedIpOtherAccounts} аккаунт(ами). ` +
        "Возможны общий Wi‑Fi/офис/мобильный NAT/VPN или технический адрес прокси — это не доказательство.",
    );
  }
  if (signals.sharedDeviceOtherAccounts > 0) {
    out.push(
      `Device-сигнал (браузерный id) совпадает ещё с ${signals.sharedDeviceOtherAccounts} аккаунт(ами). ` +
        "Так бывает при входе в разные аккаунты в одном браузере (семья, тесты, админ).",
    );
  }
  if (signals.fastRegistrationPaths > 0) {
    out.push(
      `${signals.fastRegistrationPaths} оценк(и) поставлены в течение 10 минут после регистрации ` +
        "(после 30 с прослушивания). Типично для перехода по ссылке автора.",
    );
  }
  return out;
}

export type AdminRatingsGuestListenerRow = {
  guestId: string;
  ratingCount: number;
  activeCount: number;
  supersededCount: number;
  excludedCount: number;
  average: number | null;
  firstRatedAt: string | null;
  lastActivityAt: string | null;
};

export type AdminRatingsGuestSegmentTotals = {
  totalStars: number;
  ratingCount: number;
  average: number | null;
};

export type AdminRatingsGuestListenersBundle = {
  total: number;
  limit: number;
  offset: number;
  sort: "last_activity" | "rating_count" | "average";
  sortDir: AdminRatingsListenerSortDir;
  rows: AdminRatingsGuestListenerRow[];
  segments: {
    music: AdminRatingsGuestSegmentTotals;
    practice: AdminRatingsGuestSegmentTotals;
  };
};

export type AdminRatingsGuestListenerDetail =
  | { found: false }
  | {
      found: true;
      guestId: string;
      ratingTotal: number;
      eventTotal: number;
      limit: number;
      ratings: Array<{
        ratingId: string;
        practiceId: string;
        title: string;
        productKind: string | null;
        stars: number;
        createdAt: string | null;
        updatedAt: string | null;
        excluded: boolean;
        superseded: boolean;
        verification: string | null;
        ratingEligibleAt: string | null;
        realListenedMs: number | null;
      }>;
      events: Array<{
        id: string;
        practiceId: string;
        title: string;
        oldStars: number | null;
        newStars: number;
        action: string;
        occurredAt: string | null;
      }>;
      signals: {
        captchaFailures: number;
        voteCount: number;
        otherGuestsOnNetwork: number;
      };
    };

export function normalizeGuestListenerSearch(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f-]{4,36}$/i.test(trimmed)) return null;
  return trimmed;
}

function segmentTotals(value: unknown): AdminRatingsGuestSegmentTotals {
  const row = record(value);
  const totalStars = num(row.total_stars);
  const ratingCount = num(row.rating_count);
  return {
    totalStars,
    ratingCount,
    average: ratingCount > 0 ? totalStars / ratingCount : null,
  };
}

export function normalizeAdminRatingsGuestListenersRpc(
  raw: unknown,
): AdminRatingsGuestListenersBundle {
  const source = record(raw);
  const rows = Array.isArray(source.rows) ? source.rows : [];
  const segments = record(source.segments);
  const sort = text(source.sort);
  return {
    total: num(source.total),
    limit: num(source.limit, ADMIN_RATINGS_LISTENERS_PAGE_SIZE),
    offset: num(source.offset),
    sort: sort === "rating_count" || sort === "average" ? sort : "last_activity",
    sortDir: parseAdminRatingsListenerSortDir(text(source.sort_dir)),
    rows: rows.map((item) => {
      const row = record(item);
      return {
        guestId: text(row.guest_id) ?? "",
        ratingCount: num(row.rating_count),
        activeCount: num(row.active_count),
        supersededCount: num(row.superseded_count),
        excludedCount: num(row.excluded_count),
        average: nullableNum(row.average),
        firstRatedAt: text(row.first_rated_at),
        lastActivityAt: text(row.last_activity_at),
      };
    }).filter((row) => row.guestId !== ""),
    segments: {
      music: segmentTotals(segments.music),
      practice: segmentTotals(segments.practice),
    },
  };
}

export function normalizeAdminRatingsGuestListenerDetailRpc(
  raw: unknown,
): AdminRatingsGuestListenerDetail {
  const source = record(raw);
  if (source.found !== true) return { found: false };
  const guestId = text(source.guest_id);
  if (!guestId) return { found: false };
  const signals = record(source.signals);
  const ratings = Array.isArray(source.ratings) ? source.ratings : [];
  const events = Array.isArray(source.events) ? source.events : [];
  return {
    found: true,
    guestId,
    ratingTotal: num(source.rating_total),
    eventTotal: num(source.event_total),
    limit: num(source.limit),
    ratings: ratings.map((item) => {
      const row = record(item);
      return {
        ratingId: text(row.rating_id) ?? "",
        practiceId: text(row.practice_id) ?? "",
        title: text(row.title) ?? "Практика",
        productKind: text(row.product_kind),
        stars: num(row.stars),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        excluded: row.excluded === true,
        superseded: row.superseded === true,
        verification: text(row.verification),
        ratingEligibleAt: text(row.rating_eligible_at),
        realListenedMs: nullableNum(row.real_listened_ms),
      };
    }),
    events: events.map((item) => {
      const row = record(item);
      return {
        id: text(row.id) ?? "",
        practiceId: text(row.practice_id) ?? "",
        title: text(row.title) ?? "Практика",
        oldStars: nullableNum(row.old_stars),
        newStars: num(row.new_stars),
        action: text(row.action) ?? "changed",
        occurredAt: text(row.occurred_at),
      };
    }),
    signals: {
      captchaFailures: num(signals.captcha_failures),
      voteCount: num(signals.vote_count),
      otherGuestsOnNetwork: num(signals.other_guests_on_network),
    },
  };
}

export function describeAdminRatingsGuestSignals(signals: {
  captchaFailures: number;
  voteCount: number;
  otherGuestsOnNetwork: number;
}): string[] {
  const out: string[] = [];
  if (signals.captchaFailures > 0) {
    out.push(`Неудачных проверок: ${signals.captchaFailures}. Это не блокировка.`);
  }
  if (signals.otherGuestsOnNetwork > 0) {
    out.push(
      `На том же сетевом сигнале за сутки были и другие гостевые сессии: ${signals.otherGuestsOnNetwork}. Общий IP не блокируется.`,
    );
  }
  if (signals.voteCount > 0) {
    out.push(`Сохранённых изменений оценки: ${signals.voteCount}.`);
  }
  return out;
}
