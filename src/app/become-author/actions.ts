"use server";

import { redirect } from "next/navigation";

import {
  getCurrentAuthorApplication,
  isDuplicateActiveApplicationError,
  mapApplicationInsertPayload,
  mapApplicationUpdatePayload,
} from "@/lib/author-applications/queries";
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

export async function submitAuthorApplication(
  _prevState: AuthorApplicationFormState,
  formData: FormData,
): Promise<AuthorApplicationFormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/become-author");
  }

  const workspaces = await listAuthorWorkspacesForUser(user.id).catch(() => []);

  if (workspaces.length > 0) {
    return failureState(
      { form: "Вы уже являетесь автором АудиоЛада." },
      normalizeAuthorApplicationFormValues(formData),
    );
  }

  const values = normalizeAuthorApplicationFormValues(formData);
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
      { submit: "Заявка уже отправлена и не может быть изменена." },
      values,
    );
  }

  const payloadValues = values;

  if (existing && isEditableAuthorApplicationStatus(existing.status)) {
    const { error } = await supabase
      .from("author_applications")
      .update(mapApplicationUpdatePayload(payloadValues, existing, "submitted"))
      .eq("id", existing.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("author_application_submit_update_error", error.code);

      if (isDuplicateActiveApplicationError(error.message)) {
        return failureState(
          { conflict: "У вас уже есть активная заявка." },
          values,
        );
      }

      return failureState(
        { submit: "Не удалось отправить заявку. Попробуйте ещё раз." },
        values,
      );
    }
  } else if (!existing) {
    const { error } = await supabase
      .from("author_applications")
      .insert(mapApplicationInsertPayload(user.id, payloadValues, "submitted"));

    if (error) {
      console.error("author_application_submit_insert_error", error.code);

      if (isDuplicateActiveApplicationError(error.message)) {
        return failureState(
          { conflict: "У вас уже есть активная заявка." },
          values,
        );
      }

      return failureState(
        { submit: "Не удалось отправить заявку. Попробуйте ещё раз." },
        values,
      );
    }
  }

  redirect("/become-author?submitted=1");
}
