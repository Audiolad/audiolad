import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  buildAuthorOnboardingUiState,
  type AuthorOnboardingUiState,
  type AuthorOnboardingUiStateRow,
  type OnboardingChecklistKind,
} from "@/lib/author-dashboard/onboarding-ui-state";

function asRow(value: unknown): AuthorOnboardingUiStateRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const authorId = typeof row.author_id === "string" ? row.author_id : "";

  if (!authorId) {
    return null;
  }

  return {
    author_id: authorId,
    free_completed_at:
      typeof row.free_completed_at === "string" ? row.free_completed_at : null,
    free_hidden_at:
      typeof row.free_hidden_at === "string" ? row.free_hidden_at : null,
    commercial_completed_at:
      typeof row.commercial_completed_at === "string"
        ? row.commercial_completed_at
        : null,
    commercial_hidden_at:
      typeof row.commercial_hidden_at === "string"
        ? row.commercial_hidden_at
        : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export async function syncAuthorOnboardingUiState(input: {
  authorId: string;
  freeComplete: boolean;
  commercialComplete: boolean;
  now?: Date;
}): Promise<AuthorOnboardingUiState> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc(
    "sync_author_onboarding_ui_completion",
    {
      p_author_id: input.authorId,
      p_free_complete: input.freeComplete,
      p_commercial_complete: input.commercialComplete,
    },
  );

  if (error) {
    console.error("author_onboarding_ui_sync_error", error.message);
    throw new Error("onboarding_ui_sync_failed");
  }

  return buildAuthorOnboardingUiState({
    freeComplete: input.freeComplete,
    commercialComplete: input.commercialComplete,
    row: asRow(data),
    now: input.now ?? new Date(),
  });
}

export async function hideAuthorOnboardingChecklist(input: {
  authorId: string;
  checklist: OnboardingChecklistKind;
  freeComplete: boolean;
  commercialComplete: boolean;
  now?: Date;
}): Promise<AuthorOnboardingUiState> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("hide_author_onboarding_checklist", {
    p_author_id: input.authorId,
    p_checklist: input.checklist,
  });

  if (error) {
    console.error("author_onboarding_ui_hide_error", error.message);
    throw new Error("onboarding_ui_hide_failed");
  }

  return buildAuthorOnboardingUiState({
    freeComplete: input.freeComplete,
    commercialComplete: input.commercialComplete,
    row: asRow(data),
    now: input.now ?? new Date(),
  });
}
