"use server";

import { revalidatePath } from "next/cache";

import { callAuthorApplicationRpc } from "@/lib/admin/author-application-rpc";
import { requireAdminPanelAccess } from "@/lib/admin/guard";
import { sendAuthorApplicationApprovedEmail } from "@/lib/email/send-author-application-approved-email";
import { createClient } from "@/lib/supabase/server";

export type AdminAuthorApplicationActionState = {
  ok: boolean;
  error?: string;
  warning?: string;
  message?: string;
};

const INITIAL_STATE: AdminAuthorApplicationActionState = { ok: false };

function revalidateApplicationPaths(applicationId: string) {
  revalidatePath("/admin/author-applications");
  revalidatePath(`/admin/author-applications/${applicationId}`);
  revalidatePath("/admin");
  revalidatePath("/become-author");
  revalidatePath("/profile");
  revalidatePath("/author-dashboard");
}

async function runApplicationAction(
  applicationId: string,
  functionName: string,
  args: Record<string, unknown>,
  successMessage: string,
): Promise<AdminAuthorApplicationActionState> {
  await requireAdminPanelAccess();

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  const supabase = await createClient();
  const rpc = await callAuthorApplicationRpc(supabase, functionName, {
    p_application_id: applicationId,
    ...args,
  });

  if (!rpc.ok) {
    return { ok: false, error: rpc.error };
  }

  revalidateApplicationPaths(applicationId);

  return {
    ok: true,
    message: successMessage,
  };
}

export async function takeAuthorApplicationInReview(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  return runApplicationAction(
    applicationId,
    "take_author_application_in_review",
    {
      p_staff_comment: adminNote || null,
    },
    "Заявка взята в работу.",
  );
}

export async function requestAuthorApplicationChanges(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();
  const reviewComment = String(formData.get("reviewComment") ?? "").trim();

  if (!reviewComment) {
    return { ok: false, error: "Укажите комментарий для заявителя." };
  }

  return runApplicationAction(
    applicationId,
    "request_author_application_changes",
    {
      p_applicant_comment: reviewComment,
      p_staff_comment: adminNote || null,
    },
    "Запрос изменений отправлен.",
  );
}

export async function returnAuthorApplicationToReview(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  return runApplicationAction(
    applicationId,
    "return_author_application_to_review",
    {
      p_staff_comment: adminNote || null,
    },
    "Заявка возвращена на рассмотрение.",
  );
}

export async function rejectAuthorApplication(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();
  const reviewComment = String(formData.get("reviewComment") ?? "").trim();

  if (!reviewComment) {
    return { ok: false, error: "Укажите причину отклонения для заявителя." };
  }

  return runApplicationAction(
    applicationId,
    "reject_author_application",
    {
      p_applicant_comment: reviewComment,
      p_staff_comment: adminNote || null,
    },
    "Заявка отклонена.",
  );
}

export async function approveAuthorApplication(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  await requireAdminPanelAccess();

  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  const supabase = await createClient();
  const rpc = await callAuthorApplicationRpc(supabase, "approve_author_application", {
    p_application_id: applicationId,
    p_staff_comment: adminNote || null,
  });

  if (!rpc.ok) {
    return { ok: false, error: rpc.error };
  }

  revalidateApplicationPaths(applicationId);

  let warning: string | undefined;

  if (!rpc.result.idempotent) {
    const { data: application } = await supabase
      .from("author_applications")
      .select("contact_email, author_id")
      .eq("id", applicationId)
      .maybeSingle();

    const recipientEmail = application?.contact_email?.trim().toLowerCase() || null;

    if (recipientEmail && application?.author_id) {
      const emailResult = await sendAuthorApplicationApprovedEmail({
        toEmail: recipientEmail,
        applicationId,
      });

      if (!emailResult.ok) {
        console.error(
          "author_application_approved_email_failed",
          applicationId,
          emailResult.code,
        );
        warning =
          "Доступ выдан, но письмо автору не удалось отправить. Проверьте SMTP и при необходимости сообщите автору вручную.";
      }
    } else if (!recipientEmail) {
      warning =
        "Доступ выдан, но контактный email в заявке не указан — письмо не отправлено.";
    }
  }

  return {
    ok: true,
    message: rpc.result.idempotent
      ? "Заявка уже была одобрена ранее."
      : "Заявка одобрена. Авторское пространство создано.",
    warning,
  };
}

export async function resendAuthorAccessGrantedEmail(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  await requireAdminPanelAccess();

  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const forceResend = String(formData.get("forceResend") ?? "") === "1";

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  const supabase = await createClient();

  const { data: application } = await supabase
    .from("author_applications")
    .select("status, contact_email, author_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application?.author_id || application.status !== "approved") {
    return {
      ok: false,
      error: "Письмо можно отправить только для одобренной заявки с авторским пространством.",
    };
  }

  const recipientEmail = application.contact_email?.trim().toLowerCase() || null;

  if (!recipientEmail) {
    return { ok: false, error: "Контактный email в заявке не указан." };
  }

  const emailResult = await sendAuthorApplicationApprovedEmail({
    toEmail: recipientEmail,
    applicationId,
    forceResend,
  });

  revalidateApplicationPaths(applicationId);

  if (!emailResult.ok) {
    return {
      ok: false,
      error:
        emailResult.code === "already_sent"
          ? "Письмо уже было отправлено. Для повторной отправки подтвердите действие явно."
          : "Не удалось отправить письмо. Проверьте SMTP и попробуйте снова.",
    };
  }

  if (emailResult.skipped) {
    return {
      ok: false,
      error:
        "Письмо уже было отправлено ранее. Для повторной отправки подтвердите действие явно.",
    };
  }

  return {
    ok: true,
    message: forceResend
      ? "Письмо повторно отправлено."
      : "Письмо отправлено.",
  };
}

export async function suspendLinkedAuthorAccess(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  await requireAdminPanelAccess();

  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const authorId = String(formData.get("authorId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!applicationId || !authorId) {
    return { ok: false, error: "Не удалось определить авторское пространство." };
  }

  if (!reason) {
    return { ok: false, error: "Укажите причину приостановки." };
  }

  const supabase = await createClient();
  const rpc = await callAuthorApplicationRpc(supabase, "suspend_author_access", {
    p_author_id: authorId,
    p_reason: reason,
  });

  if (!rpc.ok) {
    return { ok: false, error: rpc.error };
  }

  revalidateApplicationPaths(applicationId);

  return {
    ok: true,
    message: "Авторский доступ приостановлен.",
  };
}

export async function restoreLinkedAuthorAccess(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  await requireAdminPanelAccess();

  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const authorId = String(formData.get("authorId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!applicationId || !authorId) {
    return { ok: false, error: "Не удалось определить авторское пространство." };
  }

  const supabase = await createClient();
  const rpc = await callAuthorApplicationRpc(supabase, "restore_author_access", {
    p_author_id: authorId,
    p_reason: reason || null,
  });

  if (!rpc.ok) {
    return { ok: false, error: rpc.error };
  }

  revalidateApplicationPaths(applicationId);

  return {
    ok: true,
    message: "Авторский доступ восстановлен.",
  };
}

export async function updateAuthorApplicationAdminNote(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  await requireAdminPanelAccess();

  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  if (adminNote.length > 3000) {
    return { ok: false, error: "Заметка слишком длинная." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("author_applications")
    .update({ admin_note: adminNote || null })
    .eq("id", applicationId);

  if (error) {
    console.error("admin_application_note_update_error", error.message);
    return { ok: false, error: "Не удалось сохранить заметку." };
  }

  revalidateApplicationPaths(applicationId);

  return { ok: true, message: "Внутренняя заметка сохранена." };
}

export { INITIAL_STATE as ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE };
