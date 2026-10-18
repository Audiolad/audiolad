import {
  isAuthorPayoutProfileStatus,
  type AuthorPayoutProfileStatus,
} from "./types";

/**
 * Single source of truth for how the author cabinet describes the payout
 * profile (requisites) state.
 *
 * Only the real `author_payout_profiles.status` decides the label. Filled
 * fields alone never mean "submitted", and a failed / unknown load must never
 * be rendered as «не заполнены» – that is reserved for "there is no profile".
 *
 * Presence/status only: this module never receives or returns requisites.
 */
export type PayoutProfileStatusSource =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "feature_disabled" }
  | { kind: "loaded"; status: AuthorPayoutProfileStatus | null };

export type PayoutProfileDisplayKind =
  | "loading"
  | "feature_disabled"
  | "unavailable"
  | "missing"
  | "draft"
  | "submitted"
  | "in_review"
  | "needs_changes"
  | "rejected"
  | "verified";

export type PayoutProfileDisplayState = {
  kind: PayoutProfileDisplayKind;
  title: string;
  /** Short status line shown on the cabinet card. */
  statusLabel: string | null;
  description: string | null;
  ctaLabel: string | null;
  tone: "neutral" | "info" | "warning" | "success";
  /** Informational finance banner (never blocks KPI / ledger). */
  showFinanceBanner: boolean;
};

export const PAYOUT_PROFILE_DISPLAY_TITLE = "Реквизиты для выплат";

export const PAYOUT_PROFILE_MISSING_DESCRIPTION =
  "Реквизиты для выплат пока не заполнены. Они понадобятся, когда вы захотите получить вознаграждение.";

export const PAYOUT_PROFILE_DRAFT_STATUS_LABEL =
  "Черновик сохранён – завершите оформление";

export const PAYOUT_PROFILE_UNAVAILABLE_DESCRIPTION =
  "Не удалось загрузить статус реквизитов. Обновите страницу или откройте данные для выплат.";

const OPEN_DETAILS_CTA = "Открыть данные для выплат";

export function resolvePayoutProfileDisplayState(
  source: PayoutProfileStatusSource,
): PayoutProfileDisplayState {
  const title = PAYOUT_PROFILE_DISPLAY_TITLE;

  if (source.kind === "loading") {
    return {
      kind: "loading",
      title,
      statusLabel: null,
      description: null,
      ctaLabel: null,
      tone: "neutral",
      showFinanceBanner: false,
    };
  }

  if (source.kind === "feature_disabled") {
    return {
      kind: "feature_disabled",
      title,
      statusLabel: null,
      description: null,
      ctaLabel: null,
      tone: "neutral",
      showFinanceBanner: false,
    };
  }

  if (source.kind === "error" || !isKnownStatusOrNull(source.status)) {
    return {
      kind: "unavailable",
      title,
      statusLabel: "Статус временно недоступен",
      description: PAYOUT_PROFILE_UNAVAILABLE_DESCRIPTION,
      ctaLabel: OPEN_DETAILS_CTA,
      tone: "neutral",
      showFinanceBanner: true,
    };
  }

  switch (source.status) {
    case null:
      return {
        kind: "missing",
        title,
        statusLabel: "Не заполнены",
        description: PAYOUT_PROFILE_MISSING_DESCRIPTION,
        ctaLabel: "Заполнить реквизиты",
        tone: "info",
        showFinanceBanner: true,
      };
    case "draft":
      return {
        kind: "draft",
        title,
        statusLabel: PAYOUT_PROFILE_DRAFT_STATUS_LABEL,
        description:
          "Данные сохранены, но ещё не отправлены на проверку. Отправьте их, когда будете готовы получать вознаграждение.",
        ctaLabel: "Продолжить оформление",
        tone: "info",
        showFinanceBanner: true,
      };
    case "submitted":
      return {
        kind: "submitted",
        title,
        statusLabel: "Отправлены на проверку",
        description:
          "Мы получили реквизиты и сообщим о результате проверки.",
        ctaLabel: OPEN_DETAILS_CTA,
        tone: "info",
        showFinanceBanner: true,
      };
    case "in_review":
      return {
        kind: "in_review",
        title,
        statusLabel: "На проверке",
        description: "Реквизиты проверяются – мы сообщим о результате.",
        ctaLabel: OPEN_DETAILS_CTA,
        tone: "info",
        showFinanceBanner: true,
      };
    case "needs_changes":
      return {
        kind: "needs_changes",
        title,
        statusLabel: "Требуется уточнение",
        description:
          "Проверка вернула реквизиты на уточнение – посмотрите комментарий и отправьте их снова.",
        ctaLabel: "Уточнить реквизиты",
        tone: "warning",
        showFinanceBanner: true,
      };
    case "rejected":
      return {
        kind: "rejected",
        title,
        statusLabel: "Требуется уточнение",
        description: "Реквизиты не приняты – откройте решение проверки.",
        ctaLabel: "Открыть решение",
        tone: "warning",
        showFinanceBanner: true,
      };
    case "verified":
      return {
        kind: "verified",
        title,
        statusLabel: "Подтверждены",
        description: null,
        ctaLabel: null,
        tone: "success",
        showFinanceBanner: false,
      };
    default:
      return resolvePayoutProfileDisplayState({ kind: "error" });
  }
}

function isKnownStatusOrNull(
  value: unknown,
): value is AuthorPayoutProfileStatus | null {
  return value === null || isAuthorPayoutProfileStatus(value);
}

/**
 * Normalizes a `/api/author/payout-profile` GET response into a status source.
 * A non-OK response, a malformed body or an unknown status are errors – never
 * "no profile".
 */
export function payoutProfileStatusSourceFromApi(input: {
  ok: boolean;
  payload: unknown;
}): PayoutProfileStatusSource {
  if (!input.ok) return { kind: "error" };
  const payload = input.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { kind: "error" };
  }
  const record = payload as { featureEnabled?: unknown; profile?: unknown };
  if (record.featureEnabled === false) return { kind: "feature_disabled" };
  if (record.featureEnabled !== true) return { kind: "error" };
  if (record.profile === null) return { kind: "loaded", status: null };
  if (!record.profile || typeof record.profile !== "object") {
    return { kind: "error" };
  }
  const status = (record.profile as { status?: unknown }).status;
  if (!isAuthorPayoutProfileStatus(status)) return { kind: "error" };
  return { kind: "loaded", status };
}

/**
 * Normalizes a server-side row lookup (service role, scoped by author_id).
 */
export function payoutProfileStatusSourceFromRow(input: {
  error: unknown;
  row: { status?: unknown } | null | undefined;
}): PayoutProfileStatusSource {
  if (input.error) return { kind: "error" };
  if (!input.row) return { kind: "loaded", status: null };
  if (!isAuthorPayoutProfileStatus(input.row.status)) return { kind: "error" };
  return { kind: "loaded", status: input.row.status };
}

/**
 * The cabinet keeps one status per selected author workspace. A status loaded
 * for another workspace (e.g. right after switching) is treated as loading,
 * never shown for the newly selected author.
 */
export function selectPayoutProfileSourceForWorkspace(
  state: { authorId: string | null; source: PayoutProfileStatusSource },
  selectedAuthorId: string | null,
): PayoutProfileStatusSource {
  if (!selectedAuthorId || state.authorId !== selectedAuthorId) {
    return { kind: "loading" };
  }
  return state.source;
}

/** Client fetch of the current workspace's payout profile status (no-store). */
export async function fetchPayoutProfileStatusSource(
  authorId: string,
  signal?: AbortSignal,
): Promise<PayoutProfileStatusSource> {
  try {
    const response = await fetch(
      `/api/author/payout-profile?author_id=${encodeURIComponent(authorId)}`,
      { cache: "no-store", signal },
    );
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return payoutProfileStatusSourceFromApi({ ok: response.ok, payload });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { kind: "error" };
  }
}

/**
 * A server-rendered status card must be re-rendered when a fresh read shows
 * a different real status (or the server render could not load it). A failed
 * fresh read never triggers a refresh loop.
 */
export function shouldRefreshServerRenderedPayoutStatus(
  rendered: { status: AuthorPayoutProfileStatus | null; loadFailed: boolean },
  fresh: PayoutProfileStatusSource,
): boolean {
  if (fresh.kind !== "loaded") return false;
  if (rendered.loadFailed) return true;
  return fresh.status !== rendered.status;
}

type PageReturnTargets = {
  document: {
    visibilityState: string;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  };
  window: {
    addEventListener(
      type: "pageshow",
      listener: (event: { persisted?: boolean }) => void,
    ): void;
    removeEventListener(
      type: "pageshow",
      listener: (event: { persisted?: boolean }) => void,
    ): void;
  };
};

/**
 * Calls onReturn when the author comes back to the page (tab visible again,
 * or restored from the back/forward cache). Returns the cleanup function.
 */
export function subscribeToPageReturn(
  targets: PageReturnTargets,
  onReturn: () => void,
): () => void {
  const onVisibility = () => {
    if (targets.document.visibilityState === "visible") onReturn();
  };
  const onPageShow = (event: { persisted?: boolean }) => {
    if (event.persisted) onReturn();
  };
  targets.document.addEventListener("visibilitychange", onVisibility);
  targets.window.addEventListener("pageshow", onPageShow);
  return () => {
    targets.document.removeEventListener("visibilitychange", onVisibility);
    targets.window.removeEventListener("pageshow", onPageShow);
  };
}

export type ServerRenderedPayoutStatusDecision = "refresh" | "unavailable" | "keep";

/**
 * What the server-rendered status card should do after a fresh read:
 * - refresh: the real status differs (or SSR failed) – re-render on server;
 * - unavailable: the fresh read failed – show "status unknown" instead of a
 *   possibly stale SSR label (never keep a stale «не заполнены»);
 * - keep: the SSR card matches the real status.
 */
export function decideServerRenderedPayoutStatus(
  rendered: { status: AuthorPayoutProfileStatus | null; loadFailed: boolean },
  fresh: PayoutProfileStatusSource,
): ServerRenderedPayoutStatusDecision {
  if (fresh.kind === "error") return "unavailable";
  if (shouldRefreshServerRenderedPayoutStatus(rendered, fresh)) return "refresh";
  return "keep";
}

/**
 * Framework-free revalidation lifecycle for a server-rendered status card
 * (used by AuthorStatusClient; unit-tested without a DOM). Reads the status
 * once on start and on every page return; aborts the previous read; never
 * reports after dispose.
 */
export function startServerRenderedPayoutStatusRevalidation(input: {
  authorId: string;
  rendered: { status: AuthorPayoutProfileStatus | null; loadFailed: boolean };
  fetchSource: (
    authorId: string,
    signal: AbortSignal,
  ) => Promise<PayoutProfileStatusSource>;
  targets: PageReturnTargets;
  onRefresh: () => void;
  onUnavailableChange: (unavailable: boolean) => void;
}): () => void {
  let disposed = false;
  let inFlight: AbortController | null = null;

  async function revalidate() {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    let fresh: PayoutProfileStatusSource;
    try {
      fresh = await input.fetchSource(input.authorId, controller.signal);
    } catch {
      return; // aborted
    }
    if (disposed || controller.signal.aborted) return;
    const decision = decideServerRenderedPayoutStatus(input.rendered, fresh);
    input.onUnavailableChange(decision === "unavailable");
    if (decision === "refresh") input.onRefresh();
  }

  void revalidate();
  const unsubscribe = subscribeToPageReturn(input.targets, () => {
    void revalidate();
  });

  return () => {
    disposed = true;
    inFlight?.abort();
    unsubscribe();
  };
}
