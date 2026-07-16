"use server";

import {
  getCurrentAuthorApplication,
  isDuplicateActiveApplicationError,
  mapApplicationInsertPayload,
  mapApplicationUpdatePayload,
} from "@/lib/author-applications/queries";
import { AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE } from "@/lib/author-applications/draft";
import {
  canSubmitAuthorApplicationStatus,
  isEditableAuthorApplicationStatus,
} from "@/lib/author-applications/status";
import type { AuthorApplicationFormState } from "@/lib/author-applications/types";
import {
  hasAuthorApplicationFieldErrors,
  normalizeAuthorApplicationFormValues,
  validateAuthorApplicationFormValues,
} from "@/lib/author-applications/validation";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

function failureState(
  errors: AuthorApplicationFormState["errors"],
  values: AuthorApplicationFormState["values"],
): AuthorApplicationFormState {
  return {
    ok: false,
    errors,
    values,
  };
}

function successState(contact: string, values: AuthorApplicationFormState["values"]): AuthorApplicationFormState {
  return {
    ok: true,
    submitted: true,
    submittedContact: contact,
    errors: {},
    values,
  };
}

export async function submitAuthorApplication(
  _prevState: AuthorApplicationFormState,
  formData: FormData,
): Promise<AuthorApplicationFormState> {
  const values = normalizeAuthorApplicationFormValues(formData);

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return failureState(
        { auth: "Войдите в аккаунт, чтобы отправить заявку." },
        values,
      );
    }

    const workspaces = await listAuthorWorkspacesForUser(user.id).catch(() => []);

    if (workspaces.length > 0) {
      return failureState(
        { form: "Вы уже являетесь автором АудиоЛада." },
        values,
      );
    }

    const errors = validateAuthorApplicationFormValues(values, {
      requireConsent: true,
    });

    if (hasAuthorApplicationFieldErrors(errors)) {
      return failureState(errors, values);
    }

    const existing = await getCurrentAuthorApplication(supabase, user.id).catch(
      () => null,
    );

    if (existing && !canSubmitAuthorApplicationStatus(existing.status)) {
      return failureState(
        { conflict: "Заявка уже отправлена и находится на рассмотрении." },
        values,
      );
    }

    if (existing && isEditableAuthorApplicationStatus(existing.status)) {
      const { error } = await supabase
        .from("author_applications")
        .update(mapApplicationUpdatePayload(values, existing, "submitted"))
        .eq("id", existing.id)
        .eq("user_id", user.id);

      if (error) {
        console.error("author_application_submit_update_error", {
          code: error.code,
          message: error.message,
          details: error.details,
        });

        if (isDuplicateActiveApplicationError(error.message)) {
          return failureState(
            { conflict: "У вас уже есть активная заявка." },
            values,
          );
        }

        return failureState(
          { submit: AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE },
          values,
        );
      }
    } else if (!existing) {
      const { error } = await supabase
        .from("author_applications")
        .insert(mapApplicationInsertPayload(user.id, values, "submitted"));

      if (error) {
        console.error("author_application_submit_insert_error", {
          code: error.code,
          message: error.message,
          details: error.details,
        });

        if (isDuplicateActiveApplicationError(error.message)) {
          return failureState(
            { conflict: "У вас уже есть активная заявка." },
            values,
          );
        }

        return failureState(
          { submit: AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE },
          values,
        );
      }
    } else {
      return failureState(
        { conflict: "Заявка уже отправлена и находится на рассмотрении." },
        values,
      );
    }

    return successState(values.contact, values);
  } catch (error) {
    console.error("author_application_submit_unexpected", error);

    return failureState(
      { submit: AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE },
      values,
    );
  }
}
