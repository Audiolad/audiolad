import type { AuthorApplicationFormValues, AuthorApplicationRow } from "./types";

const DIRECTION_OTHER = "Другое";
const OTHER_PREFIX = `${DIRECTION_OTHER}:`;

function serializeDraftDirection(
  selectedDirections: string[],
  directionOther: string,
): string {
  const presets = selectedDirections.filter((item) => item !== DIRECTION_OTHER);
  const parts = [...presets];

  if (selectedDirections.includes(DIRECTION_OTHER)) {
    const other = directionOther.trim();
    if (other) {
      parts.push(`${OTHER_PREFIX} ${other}`);
    }
  }

  return parts.join(", ");
}

export const AUTHOR_APPLICATION_DRAFT_STORAGE_KEY =
  "audiolad.authorApplication.draft";

export type StoredAuthorApplicationDraft = {
  displayName: string;
  selectedDirections: string[];
  directionOther: string;
  about: string;
  contact: string;
  hasReadyMaterials: boolean;
  wantsTraining: boolean;
  interestedInSchool: boolean;
  savedAt: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function formValuesToDraft(
  values: AuthorApplicationFormValues,
  savedAt = new Date().toISOString(),
): StoredAuthorApplicationDraft {
  return {
    displayName: values.displayName,
    selectedDirections: values.selectedDirections,
    directionOther: values.directionOther,
    about: values.about,
    contact: values.contact,
    hasReadyMaterials: values.hasReadyMaterials,
    wantsTraining: values.wantsTraining,
    interestedInSchool: values.interestedInSchool,
    savedAt,
  };
}

export function draftToFormValues(
  draft: StoredAuthorApplicationDraft,
): AuthorApplicationFormValues {
  return {
    displayName: draft.displayName,
    selectedDirections: draft.selectedDirections,
    directionOther: draft.directionOther,
    direction: serializeDraftDirection(draft.selectedDirections, draft.directionOther),
    about: draft.about,
    contact: draft.contact,
    hasReadyMaterials: draft.hasReadyMaterials,
    wantsTraining: draft.wantsTraining,
    interestedInSchool: draft.interestedInSchool,
    consentPersonalData: false,
  };
}

export function parseStoredAuthorApplicationDraft(
  raw: string | null,
): StoredAuthorApplicationDraft | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthorApplicationDraft>;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (
      typeof parsed.displayName !== "string" ||
      !Array.isArray(parsed.selectedDirections) ||
      typeof parsed.directionOther !== "string" ||
      typeof parsed.about !== "string" ||
      typeof parsed.contact !== "string" ||
      typeof parsed.hasReadyMaterials !== "boolean" ||
      typeof parsed.wantsTraining !== "boolean" ||
      typeof parsed.interestedInSchool !== "boolean"
    ) {
      return null;
    }

    return {
      displayName: parsed.displayName,
      selectedDirections: parsed.selectedDirections.filter(
        (item): item is string => typeof item === "string",
      ),
      directionOther: parsed.directionOther,
      about: parsed.about,
      contact: parsed.contact,
      hasReadyMaterials: parsed.hasReadyMaterials,
      wantsTraining: parsed.wantsTraining,
      interestedInSchool: parsed.interestedInSchool,
      savedAt:
        typeof parsed.savedAt === "string"
          ? parsed.savedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function readAuthorApplicationDraft(
  storage: StorageLike | null | undefined,
): StoredAuthorApplicationDraft | null {
  try {
    return parseStoredAuthorApplicationDraft(
      storage?.getItem(AUTHOR_APPLICATION_DRAFT_STORAGE_KEY) ?? null,
    );
  } catch {
    return null;
  }
}

export function writeAuthorApplicationDraft(
  storage: StorageLike | null | undefined,
  draft: StoredAuthorApplicationDraft,
): void {
  try {
    storage?.setItem(
      AUTHOR_APPLICATION_DRAFT_STORAGE_KEY,
      JSON.stringify(draft),
    );
  } catch {
    // localStorage may be unavailable.
  }
}

export function clearAuthorApplicationDraft(
  storage: StorageLike | null | undefined,
): void {
  try {
    storage?.removeItem(AUTHOR_APPLICATION_DRAFT_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable.
  }
}

export function shouldPreferDatabaseApplication(
  application: Pick<AuthorApplicationRow, "status"> | null,
): boolean {
  if (!application) {
    return false;
  }

  return application.status === "draft" || application.status === "needs_changes";
}

export function resolveInitialAuthorApplicationFormValues(input: {
  databaseValues: AuthorApplicationFormValues;
  application: AuthorApplicationRow | null;
  draft: StoredAuthorApplicationDraft | null;
}): { values: AuthorApplicationFormValues; restoredFromDraft: boolean } {
  if (shouldPreferDatabaseApplication(input.application)) {
    return {
      values: {
        ...input.databaseValues,
        consentPersonalData: false,
      },
      restoredFromDraft: false,
    };
  }

  if (input.draft) {
    return {
      values: draftToFormValues(input.draft),
      restoredFromDraft: true,
    };
  }

  return {
    values: input.databaseValues,
    restoredFromDraft: false,
  };
}

export const AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE =
  "Не удалось отправить заявку. Ваши данные сохранены — попробуйте ещё раз.";
