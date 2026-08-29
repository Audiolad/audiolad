export const ONBOARDING_COMPACT_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export const ONBOARDING_CHECKLIST_KINDS = ["free", "commercial"] as const;

export type OnboardingChecklistKind = (typeof ONBOARDING_CHECKLIST_KINDS)[number];

export type OnboardingChecklistPresentation = "expanded" | "compact";

export type OnboardingChecklistUiFields = {
  completedAt: string | null;
  hiddenAt: string | null;
};

export type OnboardingChecklistUiState = OnboardingChecklistUiFields & {
  presentation: OnboardingChecklistPresentation;
};

export type AuthorOnboardingUiState = {
  free: OnboardingChecklistUiState;
  commercial: OnboardingChecklistUiState;
};

export type AuthorOnboardingUiStateRow = {
  author_id: string;
  free_completed_at: string | null;
  free_hidden_at: string | null;
  commercial_completed_at: string | null;
  commercial_hidden_at: string | null;
  updated_at?: string;
};

export function isOnboardingChecklistKind(
  value: unknown,
): value is OnboardingChecklistKind {
  return value === "free" || value === "commercial";
}

export function resolveChecklistPresentation(input: {
  complete: boolean;
  completedAt: string | null;
  hiddenAt: string | null;
  now: Date | string | number;
}): OnboardingChecklistPresentation {
  if (!input.complete) {
    return "expanded";
  }

  if (input.hiddenAt) {
    return "compact";
  }

  if (input.completedAt) {
    const completedMs = Date.parse(input.completedAt);
    const nowMs =
      typeof input.now === "number"
        ? input.now
        : typeof input.now === "string"
          ? Date.parse(input.now)
          : input.now.getTime();

    if (
      Number.isFinite(completedMs) &&
      Number.isFinite(nowMs) &&
      nowMs >= completedMs + ONBOARDING_COMPACT_GRACE_MS
    ) {
      return "compact";
    }
  }

  return "expanded";
}

/**
 * Mirrors SQL epoch stamp/clear. `nowIso` is only used in tests; production
 * stamps with Postgres `now()` so the 3-day clock is the database clock.
 */
export function planOnboardingUiEpochSync(input: {
  complete: boolean;
  completedAt: string | null;
  hiddenAt: string | null;
  nowIso: string;
}): OnboardingChecklistUiFields {
  if (!input.complete) {
    return { completedAt: null, hiddenAt: null };
  }

  return {
    completedAt: input.completedAt ?? input.nowIso,
    hiddenAt: input.hiddenAt,
  };
}

export function buildAuthorOnboardingUiState(input: {
  freeComplete: boolean;
  commercialComplete: boolean;
  row: Pick<
    AuthorOnboardingUiStateRow,
    | "free_completed_at"
    | "free_hidden_at"
    | "commercial_completed_at"
    | "commercial_hidden_at"
  > | null;
  now: Date | string | number;
}): AuthorOnboardingUiState {
  const freeFields = {
    completedAt: input.row?.free_completed_at ?? null,
    hiddenAt: input.row?.free_hidden_at ?? null,
  };
  const commercialFields = {
    completedAt: input.row?.commercial_completed_at ?? null,
    hiddenAt: input.row?.commercial_hidden_at ?? null,
  };

  return {
    free: {
      ...freeFields,
      presentation: resolveChecklistPresentation({
        complete: input.freeComplete,
        ...freeFields,
        now: input.now,
      }),
    },
    commercial: {
      ...commercialFields,
      presentation: resolveChecklistPresentation({
        complete: input.commercialComplete,
        ...commercialFields,
        now: input.now,
      }),
    },
  };
}

export function resolveOnboardingHideDecision(input: { complete: boolean }):
  | { ok: true }
  | { ok: false; status: 409; error: "checklist_incomplete" } {
  if (!input.complete) {
    return { ok: false, status: 409, error: "checklist_incomplete" };
  }

  return { ok: true };
}

export function parseOnboardingUiHideBody(body: unknown):
  | { ok: true; authorId: string; checklist: OnboardingChecklistKind }
  | { ok: false; status: 400; error: "invalid_request" } {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  const record = body as Record<string, unknown>;
  const authorId =
    typeof record.author_id === "string" ? record.author_id.trim() : "";

  if (!authorId || !isOnboardingChecklistKind(record.checklist)) {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  if (record.action !== undefined && record.action !== "hide") {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  return { ok: true, authorId, checklist: record.checklist };
}

export function shouldBridgeLegacyOnboardingDismiss(input: {
  dismissed: boolean;
  freeComplete: boolean;
  commercialComplete: boolean;
  freeHiddenAt: string | null;
  commercialHiddenAt: string | null;
}): OnboardingChecklistKind[] {
  if (!input.dismissed) {
    return [];
  }

  if (!input.freeComplete || !input.commercialComplete) {
    return [];
  }

  const kinds: OnboardingChecklistKind[] = [];

  if (!input.freeHiddenAt) {
    kinds.push("free");
  }

  if (!input.commercialHiddenAt) {
    kinds.push("commercial");
  }

  return kinds;
}
