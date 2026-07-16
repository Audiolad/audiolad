"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPanelAccess } from "@/lib/admin/guard";
import type { AuthorApplicationStatus } from "@/lib/author-applications/types";
import { createClient } from "@/lib/supabase/server";

export type UpdateAuthorApplicationState = {
  ok: boolean;
  error?: string;
};

const ALLOWED_ADMIN_STATUSES: AuthorApplicationStatus[] = [
  "submitted",
  "in_review",
  "needs_changes",
  "approved",
  "rejected",
  "withdrawn",
];

export async function updateAuthorApplicationReview(
  _prevState: UpdateAuthorApplicationState,
  formData: FormData,
): Promise<UpdateAuthorApplicationState> {
  await requireAdminPanelAccess();
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as AuthorApplicationStatus;
  const reviewComment = String(formData.get("adminNote") ?? "").trim();

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  if (!ALLOWED_ADMIN_STATUSES.includes(status)) {
    return { ok: false, error: "Недопустимый статус." };
  }

  if (reviewComment.length > 3000) {
    return { ok: false, error: "Заметка слишком длинная." };
  }

  const supabase = await createClient();

  const payload: {
    status: AuthorApplicationStatus;
    admin_note: string | null;
  } = {
    status,
    admin_note: reviewComment || null,
  };

  const { error } = await supabase
    .from("author_applications")
    .update(payload)
    .eq("id", applicationId);

  if (error) {
    console.error("admin_application_update_error", error.message);
    return { ok: false, error: "Не удалось сохранить изменения." };
  }

  revalidatePath("/admin/author-applications");
  revalidatePath(`/admin/author-applications/${applicationId}`);
  revalidatePath("/admin");

  return { ok: true };
}
