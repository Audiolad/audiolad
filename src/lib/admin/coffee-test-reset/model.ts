/**
 * «Тестовый аккаунт кофейни» (owner request 04.11.2026). Pure model shared by the admin
 * page, the server action, the coffee /test-reset page and the unit test.
 *
 * The allowlist lives only in the DB (public.business_test_account_allowlist, sha256 of
 * the address). No address is ever written in code, logs or UI: the UI gets a masked one.
 */

export const COFFEE_TEST_ACCOUNT_HREF = "/admin/business-coffee-test-account";
/** Public path on coffee./business.audiolad.ru that wipes this browser's local state. */
export const COFFEE_TEST_RESET_PUBLIC_PATH = "/test-reset";

export type CoffeeTestAccount = {
  userId: string;
  emailMasked: string;
  organizations: number;
  gifts: number;
  paidSummaries: number;
  offerAcceptances: number;
  subscriptionPeriods: number;
  lastResetAt: string | null;
};

export const COFFEE_TEST_RESET_COUNT_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["organizations_closed", "Кофейня закрыта (история и оплаты сохранены)"],
  ["locations_closed", "Точки закрыты"],
  ["players_retired", "Плееры выведены"],
  ["point_sessions_revoked", "Сессии планшетов отозваны"],
  ["memberships", "Связи с кофейней сняты"],
  ["guest_starts", "Гостевые старты"],
  ["trial_activity_days", "Дни активности подарка"],
  ["gifts", "Подарок «7 дней» – отвязан"],
  ["gift_identities", "Метки подарка"],
  ["gift_events", "События подарка"],
  ["paid_summaries", "Сводка оплаченного периода (не оплата)"],
  ["offer_edition_acceptances", "Принятия редакции оферты"],
  ["offer_acceptances", "Принятия документов"],
  ["workspace_playback", "Состояние плеера кабинета"],
  ["guest_meter_devices", "30 минут: счётчик этого устройства"],
  ["guest_meter_network_days", "30 минут: счётчик этой сети"],
  ["guest_start_limit_hits", "Лимит гостевых стартов этой сети"],
  ["analytics_events_marked_test", "События аналитики помечены как тестовые"],
];

export type CoffeeTestResetErrorCode =
  | "forbidden"
  | "not_allowlisted"
  | "protected"
  | "shared_venue"
  | "invalid"
  | "unavailable";

export function coffeeTestResetErrorCode(message: string | null | undefined): CoffeeTestResetErrorCode {
  const text = message ?? "";
  if (text.includes("test_reset_forbidden")) return "forbidden";
  if (text.includes("test_reset_target_not_allowlisted")) return "not_allowlisted";
  if (text.includes("test_reset_target_protected")) return "protected";
  if (text.includes("test_reset_shared_organization")) return "shared_venue";
  if (text.includes("test_reset_input_invalid") || text.includes("test_reset_input_required")) return "invalid";
  return "unavailable";
}

export const COFFEE_TEST_RESET_ERROR_TEXT: Record<CoffeeTestResetErrorCode, string> = {
  forbidden: "Сброс доступен только владельцу платформы.",
  not_allowlisted: "Этого аккаунта нет в списке тестовых – сброс невозможен.",
  protected: "Аккаунт сотрудника платформы сбросить нельзя.",
  shared_venue: "В кофейне есть другие участники – сброс отменён, ничего не изменено.",
  invalid: "Не удалось определить устройство или сеть – попробуйте ещё раз.",
  unavailable: "Сброс сейчас недоступен – ничего не изменено. Попробуйте позже.",
};

export function parseCoffeeTestAccounts(rows: unknown): CoffeeTestAccount[] {
  if (!Array.isArray(rows)) return [];
  const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.user_id !== "string" || typeof r.email_masked !== "string") return [];
    return [{
      userId: r.user_id,
      emailMasked: r.email_masked,
      organizations: n(r.organizations),
      gifts: n(r.gifts),
      paidSummaries: n(r.paid_summaries),
      offerAcceptances: n(r.offer_acceptances),
      subscriptionPeriods: n(r.subscription_periods),
      lastResetAt: typeof r.last_reset_at === "string" ? r.last_reset_at : null,
    }];
  });
}

export type CoffeeTestResetCounts = Record<string, number>;

export function parseCoffeeTestResetCounts(data: unknown): CoffeeTestResetCounts {
  const counts = data && typeof data === "object" ? (data as { counts?: unknown }).counts : null;
  if (!counts || typeof counts !== "object") return {};
  return Object.fromEntries(Object.entries(counts as Record<string, unknown>)
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value)) as [string, number][]);
}

/** Same check as validGuestToken/uuid in SQL – never pass anything else to the RPC. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Browser side: what /test-reset wipes on this origin ----------

/** Every Audiolad key of this origin: business cabinet, guest start, analytics, consent. */
export function isCoffeeTestStorageKey(key: string): boolean {
  return key.startsWith("audiolad");
}

/**
 * Our cookies only (al-coffee-pref-*, al-point, al-biz-view, al_biz_guest*, audiolad_*).
 * The auth scope marker is left to the Supabase cookie code (expiring it by hand caused a
 * redirect loop once – see coffee-host-proxy.ts).
 */
export function isCoffeeTestCookieName(name: string): boolean {
  if (name === "al-auth-scope") return false;
  return name.startsWith("al-") || name.startsWith("al_") || name.startsWith("audiolad");
}

/**
 * One-time arm marker set by the owner's reset action (.audiolad.ru, 10 minutes). Without it
 * /test-reset wipes nothing, so a link to /test-reset cannot unpair a hall tablet or log
 * anyone out.
 */
export const COFFEE_TEST_RESET_ARM_COOKIE = "al_coffee_test_reset";
export const COFFEE_TEST_RESET_ARM_MAX_AGE = 600;

/** Httponly cookies the server expires (host-only twin and .audiolad.ru copy). */
export const COFFEE_TEST_SERVER_COOKIES = [
  "al_biz_guest_shared",
  "al_biz_guest",
  "al_coffee_handoff",
  "al-point",
  "al-biz-view",
] as const;
