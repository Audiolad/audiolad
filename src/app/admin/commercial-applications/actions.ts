"use server";

import { revalidatePath } from "next/cache";

import type { AdminCommercialApplicationActionState } from "@/app/admin/commercial-applications/action-state";
import { callCommercialApplicationRpc } from "@/lib/author-commercial-applications/rpc";
import { requireAdminPermission } from "@/lib/admin/guard";
import { sendCommercialApplicationApprovedEmail } from "@/lib/email/send-commercial-application-approved-email";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function revalidateCommercialApplicationPaths(applicationId: string) {
  revalidatePath("/admin/commercial-applications");
  revalidatePath(`/admin/commercial-applications/${applicationId}`);
  revalidatePath("/admin");
  revalidatePath("/author-dashboard");
  revalidatePath("/author-dashboard/commercial-application");
  revalidatePath("/author-dashboard/commercial/payout-details");
  revalidatePath("/author-dashboard/commercial/terms");
}

async function runCommercialApplicationAction(
  applicationId: string,
  functionName: string,
  args: Record<string, unknown>,
  successMessage: string,
): Promise<AdminCommercialApplicationActionState> {
  await requireAdminPermission("authors.manage");

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  const supabase = await createClient();
  const rpc = await callCommercialApplicationRpc(supabase, functionName, {
    p_application_id: applicationId,
    ...args,
  });

  if (!rpc.ok) {
    return { ok: false, error: rpc.error };
  }

  revalidateCommercialApplicationPaths(applicationId);

  return {
    ok: true,
    message: successMessage,
  };
}

export async function takeCommercialApplicationInReview(
  _prevState: AdminCommercialApplicationActionState,
  formData: FormData,
): Promise<AdminCommercialApplicationActionState> {
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  return runCommercialApplicationAction(
    applicationId,
    "take_author_commercial_application_in_review",
    {
      p_staff_comment: adminNote || null,
    },
    "Заявка взята в работу.",
  );
}

export async function requestCommercialApplicationChanges(
  _prevState: AdminCommercialApplicationActionState,
  formData: FormData,
): Promise<AdminCommercialApplicationActionState> {
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();
  const reviewComment = String(formData.get("reviewComment") ?? "").trim();

  if (!reviewComment) {
    return { ok: false, error: "Укажите комментарий для заявителя." };
  }

  return runCommercialApplicationAction(
    applicationId,
    "request_author_commercial_application_changes",
    {
      p_applicant_comment: reviewComment,
      p_staff_comment: adminNote || null,
    },
    "Запрос изменений отправлен.",
  );
}

export async function approveCommercialApplication(
  _prevState: AdminCommercialApplicationActionState,
  formData: FormData,
): Promise<AdminCommercialApplicationActionState> {
  await requireAdminPermission("authors.manage");

  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  const supabase = await createClient();
  const rpc = await callCommercialApplicationRpc(
    supabase,
    "approve_author_commercial_application",
    {
      p_application_id: applicationId,
      p_staff_comment: adminNote || null,
    },
  );

  if (!rpc.ok) {
    return { ok: false, error: rpc.error };
  }

  revalidateCommercialApplicationPaths(applicationId);

  let warning: string | undefined;

  if (!rpc.result.idempotent) {
    try {
      const service = createServiceRoleClient();
      const { data: application } = await service
        .from("author_commercial_applications")
        .select("author_id, created_by")
        .eq("id", applicationId)
        .maybeSingle();

      const authorId = application?.author_id as string | undefined;
      const createdBy = application?.created_by as string | undefined;

      const [authorResult, profileResult] = await Promise.all([
        authorId
          ? service
              .from("authors")
              .select("name")
              .eq("id", authorId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        createdBy
          ? service
              .from("profiles")
              .select("email, full_name")
              .eq("id", createdBy)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const recipientEmail =
        profileResult.data?.email?.trim().toLowerCase() || null;
      const authorName =
        authorResult.data?.name?.trim() ||
        profileResult.data?.full_name?.trim() ||
        null;

      if (recipientEmail) {
        const emailResult = await sendCommercialApplicationApprovedEmail({
          toEmail: recipientEmail,
          applicationId,
          authorName,
          siteOrigin: getAppOrigin(),
          supabase: service,
        });

        if (!emailResult.ok) {
          console.error(
            "commercial_application_approved_email_failed",
            applicationId,
            emailResult.code,
          );
          warning =
            "Заявка одобрена, но письмо автору не удалось отправить. Проверьте SMTP и при необходимости сообщите автору вручную.";
        }
      } else {
        warning =
          "Заявка одобрена, но email заявителя не найден — письмо не отправлено.";
      }
    } catch (error) {
      console.error(
        "commercial_application_approved_email_unexpected",
        applicationId,
        error,
      );
      warning =
        "Заявка одобрена, но письмо автору не удалось отправить из‑за внутренней ошибки.";
    }
  }

  return {
    ok: true,
    message: rpc.result.idempotent
      ? "Заявка уже была одобрена ранее."
      : "Коммерческая заявка одобрена. Автору открыт коммерческий онбординг.",
    warning,
  };
}

export async function rejectCommercialApplication(
  _prevState: AdminCommercialApplicationActionState,
  formData: FormData,
): Promise<AdminCommercialApplicationActionState> {
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();
  const reviewComment = String(formData.get("reviewComment") ?? "").trim();

  if (!reviewComment) {
    return { ok: false, error: "Укажите причину отклонения для заявителя." };
  }

  return runCommercialApplicationAction(
    applicationId,
    "reject_author_commercial_application",
    {
      p_applicant_comment: reviewComment,
      p_staff_comment: adminNote || null,
    },
    "Заявка отклонена.",
  );
}

export async function updateCommercialApplicationAdminNote(
  _prevState: AdminCommercialApplicationActionState,
  formData: FormData,
): Promise<AdminCommercialApplicationActionState> {
  await requireAdminPermission("authors.manage");

  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  if (adminNote.length > 3000) {
    return { ok: false, error: "Заметка слишком длинная." };
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("author_commercial_applications")
    .update({ admin_note: adminNote || null })
    .eq("id", applicationId);

  if (error) {
    console.error("admin_commercial_application_note_update_error", error.message);
    return { ok: false, error: "Не удалось сохранить заметку." };
  }

  revalidateCommercialApplicationPaths(applicationId);

  return { ok: true, message: "Внутренняя заметка сохранена." };
}
