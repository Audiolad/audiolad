import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthorApplicationStatusEventRow } from "./types";

/**
 * «Отправить на доработку»: optional list of form sections the reviewer asks
 * the applicant to fix. Keys are stored in author_applications.revision_fields
 * (migration 20270219120000). Order here is the order of the applicant form.
 */
export const AUTHOR_APPLICATION_REVISION_FIELDS = [
  // display_name IS the project / space name: the form asks «Как вы хотите
  // представляться?» with the hint «Название проекта – …», and approval turns
  // it into the author space name.
  {
    key: "display_name",
    label: "Название проекта («Как вы хотите представляться?»)",
  },
  { key: "direction", label: "Направление («В каком направлении вы работаете?»)" },
  { key: "about", label: "Рассказ о себе" },
  { key: "contact_email", label: "Электронная почта" },
  { key: "contact_details", label: "Телефон, MAX или другой способ связи" },
  { key: "readiness", label: "Ваш опыт с материалами" },
  { key: "school", label: "Интерес к Школе аудиопрактик" },
] as const;

export type AuthorApplicationRevisionField =
  (typeof AUTHOR_APPLICATION_REVISION_FIELDS)[number]["key"];

const REVISION_FIELD_KEYS = new Set<string>(
  AUTHOR_APPLICATION_REVISION_FIELDS.map((field) => field.key),
);

export const AUTHOR_APPLICATION_REVISION_COMMENT_REQUIRED_MESSAGE =
  "Напишите комментарий для заявителя – что нужно исправить.";

export const AUTHOR_APPLICATION_REVISION_COMMENT_MAX = 3000;

export function isAuthorApplicationRevisionField(
  value: unknown,
): value is AuthorApplicationRevisionField {
  return typeof value === "string" && REVISION_FIELD_KEYS.has(value);
}

/** Dedupe, drop unknown keys and keep the form order. */
export function normalizeAuthorApplicationRevisionFields(
  values: readonly unknown[] | null | undefined,
): AuthorApplicationRevisionField[] {
  if (!values || !Array.isArray(values)) {
    return [];
  }

  const selected = new Set(values.filter(isAuthorApplicationRevisionField));

  return AUTHOR_APPLICATION_REVISION_FIELDS.map((field) => field.key).filter(
    (key) => selected.has(key),
  );
}

export function getAuthorApplicationRevisionFieldLabels(
  fields: readonly AuthorApplicationRevisionField[],
): string[] {
  const normalized = normalizeAuthorApplicationRevisionFields(fields);

  return AUTHOR_APPLICATION_REVISION_FIELDS.filter((field) =>
    normalized.includes(field.key),
  ).map((field) => field.label);
}

/** Statuses from which staff can send an application back for revision. */
export function canSendAuthorApplicationToRevision(status: string): boolean {
  return status === "submitted" || status === "in_review";
}

/** Applicant-facing edit link, opened from the email and the profile. */
export const AUTHOR_APPLICATION_REVISION_EDIT_PATH =
  "/become-author?revision=1#author-application-revision";

export function isAuthorApplicationResubmissionEvent(
  event: Pick<AuthorApplicationStatusEventRow, "from_status" | "to_status">,
): boolean {
  return event.from_status === "needs_changes" && event.to_status === "submitted";
}

/** Human-readable label for the admin «История решений» list. */
export function getAuthorApplicationStatusEventLabel(
  event: Pick<AuthorApplicationStatusEventRow, "from_status" | "to_status">,
): string {
  if (isAuthorApplicationResubmissionEvent(event)) {
    return "Повторно отправлена после доработки";
  }

  switch (event.to_status) {
    case "submitted":
      return "Заявка отправлена";
    case "in_review":
      return event.from_status === "needs_changes"
        ? "Возвращена на рассмотрение"
        : "Взята в работу";
    case "needs_changes":
      return "Отправлено на доработку";
    case "approved":
      return "Одобрена";
    case "rejected":
      return "Отклонена";
    case "withdrawn":
      return "Отменена";
    default:
      return `${event.from_status ?? "–"} → ${event.to_status}`;
  }
}

/**
 * Reads revision_fields separately from AUTHOR_APPLICATION_COLUMNS so that the
 * applicant and admin pages keep working if the column is not deployed yet.
 */
export async function loadAuthorApplicationRevisionFields(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<AuthorApplicationRevisionField[]> {
  try {
    const { data, error } = await supabase
      .from("author_applications")
      .select("revision_fields")
      .eq("id", applicationId)
      .maybeSingle();

    if (error || !data) {
      return [];
    }

    const raw = (data as { revision_fields?: unknown }).revision_fields;

    return normalizeAuthorApplicationRevisionFields(
      Array.isArray(raw) ? raw : [],
    );
  } catch {
    return [];
  }
}
