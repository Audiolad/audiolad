export const EDITORIAL_PLAYLIST_SAVE_READY_LABEL = "Сохранить";
export const EDITORIAL_PLAYLIST_SAVE_SAVING_LABEL = "Сохраняю…";
export const EDITORIAL_PLAYLIST_SAVE_SUCCESS_LABEL = "✓ Сохранено";
export const EDITORIAL_PLAYLIST_SAVE_ERROR_MESSAGE =
  "Не удалось сохранить изменения.";
export const EDITORIAL_PLAYLIST_COMPOSITION_SAVED_MESSAGE =
  "✓ Изменения сохранены";

export type EditorialPlaylistFormFields = {
  title: string;
  description: string;
  slug: string;
  topicKeys: readonly string[];
};

export type EditorialPlaylistSavePhase = "idle" | "saving" | "success" | "error";

export type EditorialPlaylistSaveUi = {
  phase: EditorialPlaylistSavePhase;
  error: string | null;
};

export type EditorialPlaylistSaveAction =
  | { type: "submit" }
  | { type: "success" }
  | { type: "error"; message?: string };

export type EditorialPlaylistSaveButtonView = {
  label: string;
  disabled: boolean;
  canSubmit: boolean;
};

export type EditorialCompositionMutationStatus =
  | "idle"
  | "pending"
  | "success"
  | "error";

export function snapshotEditorialPlaylistForm(
  fields: EditorialPlaylistFormFields,
): EditorialPlaylistFormFields {
  return {
    title: fields.title,
    description: fields.description,
    slug: fields.slug,
    topicKeys: [...fields.topicKeys],
  };
}

export function editorialPlaylistHasMetadataChanges(
  current: EditorialPlaylistFormFields,
  saved: EditorialPlaylistFormFields,
  slugLocked: boolean,
): boolean {
  const nextDescription = current.description.trim() || null;
  const previousDescription = saved.description.trim() || null;

  return (
    current.title !== saved.title ||
    nextDescription !== previousDescription ||
    (!slugLocked && current.slug.trim() !== (saved.slug ?? ""))
  );
}

export function editorialPlaylistHasTopicChanges(
  current: readonly string[],
  saved: readonly string[],
): boolean {
  return (
    current.length !== saved.length ||
    current.some((key, index) => key !== saved[index])
  );
}

export function isEditorialPlaylistFormDirty(
  current: EditorialPlaylistFormFields,
  saved: EditorialPlaylistFormFields,
  slugLocked: boolean,
): boolean {
  return (
    editorialPlaylistHasMetadataChanges(current, saved, slugLocked) ||
    editorialPlaylistHasTopicChanges(current.topicKeys, saved.topicKeys)
  );
}

export function createEditorialPlaylistSaveUi(): EditorialPlaylistSaveUi {
  return { phase: "idle", error: null };
}

export function reduceEditorialPlaylistSaveUi(
  state: EditorialPlaylistSaveUi,
  action: EditorialPlaylistSaveAction,
): EditorialPlaylistSaveUi {
  if (action.type === "submit") {
    if (state.phase === "saving") {
      return state;
    }

    return { phase: "saving", error: null };
  }

  if (action.type === "success") {
    if (state.phase !== "saving") {
      return state;
    }

    return { phase: "success", error: null };
  }

  if (state.phase !== "saving") {
    return state;
  }

  return {
    phase: "error",
    error: action.message?.trim() || EDITORIAL_PLAYLIST_SAVE_ERROR_MESSAGE,
  };
}

export function editorialPlaylistSaveButtonView(
  phase: EditorialPlaylistSavePhase,
  dirty: boolean,
): EditorialPlaylistSaveButtonView {
  if (phase === "saving") {
    return {
      label: EDITORIAL_PLAYLIST_SAVE_SAVING_LABEL,
      disabled: true,
      canSubmit: false,
    };
  }

  if (phase === "success" && !dirty) {
    return {
      label: EDITORIAL_PLAYLIST_SAVE_SUCCESS_LABEL,
      disabled: true,
      canSubmit: false,
    };
  }

  return {
    label: EDITORIAL_PLAYLIST_SAVE_READY_LABEL,
    disabled: false,
    canSubmit: true,
  };
}

export async function applyEditorialPlaylistSaveAttempt(
  state: EditorialPlaylistSaveUi,
  persist: () => Promise<{ ok: true } | { ok: false; message?: string }>,
): Promise<EditorialPlaylistSaveUi> {
  if (state.phase === "saving") {
    return state;
  }

  const submitted = reduceEditorialPlaylistSaveUi(state, { type: "submit" });
  const result = await persist();

  return reduceEditorialPlaylistSaveUi(
    submitted,
    result.ok
      ? { type: "success" }
      : { type: "error", message: result.message },
  );
}

export function editorialCompositionConfirmationMessage(
  status: EditorialCompositionMutationStatus,
): string | null {
  return status === "success"
    ? EDITORIAL_PLAYLIST_COMPOSITION_SAVED_MESSAGE
    : null;
}

export async function confirmEditorialCompositionAfter(
  mutation: () => Promise<boolean>,
): Promise<string | null> {
  const pendingMessage = editorialCompositionConfirmationMessage("pending");

  if (pendingMessage) {
    return pendingMessage;
  }

  const ok = await mutation();
  return editorialCompositionConfirmationMessage(ok ? "success" : "error");
}
