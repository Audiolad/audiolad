"use server";

import { revalidatePath } from "next/cache";

import type { AdminAuthorApplicationActionState } from "@/app/(platform)/admin/author-applications/action-state";
import { callAuthorApplicationRpc } from "@/lib/admin/author-application-rpc";
import { requireAdminPermission } from "@/lib/admin/guard";
import { drainPartnerActivationEmailIfNeeded } from "@/lib/author-partner/activation-email-drain";
import {
  AUTHOR_APPLICATION_REVISION_COMMENT_MAX,
  AUTHOR_APPLICATION_REVISION_COMMENT_REQUIRED_MESSAGE,
  canSendAuthorApplicationToRevision,
  getAuthorApplicationRevisionFieldLabels,
  normalizeAuthorApplicationRevisionFields,
} from "@/lib/author-applications/revision";
import { sendAuthorApplicationApprovedEmail } from "@/lib/email/send-author-application-approved-email";
import { sendAuthorApplicationNeedsChangesEmail } from "@/lib/email/send-author-application-needs-changes-email";
import { createClient } from "@/lib/supabase/server";

function revalidateApplicationPaths(applicationId: string) {
  revalidatePath("/admin/author-applications");
  revalidatePath(`/admin/author-applications/${applicationId}`);
  revalidatePath("/admin");
  revalidatePath("/admin", "layout");
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
  await requireAdminPermission("authors.manage");

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

/**
 * «Отправить на доработку»: works from «Новая» (takes it in review first) and
 * from «В работе». Sends the applicant one letter with the comment and a link
 * to the prefilled form. The letter goes out only from this button.
 */
export async function sendAuthorApplicationToRevision(
  _prevState: AdminAuthorApplicationActionState,
  formData: FormData,
): Promise<AdminAuthorApplicationActionState> {
  await requireAdminPermission("authors.manage");

  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();
  const reviewComment = String(formData.get("reviewComment") ?? "").trim();
  const revisionFields = normalizeAuthorApplicationRevisionFields(
    formData.getAll("revisionFields"),
  );

  if (!applicationId) {
    return { ok: false, error: "Не удалось определить заявку." };
  }

  if (!reviewComment) {
    return { ok: false, error: AUTHOR_APPLICATION_REVISION_COMMENT_REQUIRED_MESSAGE };
  }

  if (reviewComment.length > AUTHOR_APPLICATION_REVISION_COMMENT_MAX) {
    return {
      ok: false,
      error: `Комментарий слишком длинный – до ${AUTHOR_APPLICATION_REVISION_COMMENT_MAX} символов.`,
    };
  }

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from("author_applications")
    .select("status")
    .eq("id", applicationId)
    .maybeSingle();

  if (loadError || !current) {
    return { ok: false, error: "Заявка не найдена." };
  }

  if (!canSendAuthorApplicationToRevision(String(current.status))) {
    return {
      ok: false,
      error: "На доработку можно отправить только новую заявку или заявку в работе.",
    };
  }

  if (current.status === "submitted") {
    const take = await callAuthorApplicationRpc(
      supabase,
      "take_author_application_in_review",
      { p_application_id: applicationId, p_staff_comment: null },
    );

    if (!take.ok) {
      return { ok: false, error: take.error };
    }
  }

  const rpc = await callAuthorApplicationRpc(
    supabase,
    "request_author_application_changes",
    {
      p_application_id: applicationId,
      p_applicant_comment: reviewComment,
      p_staff_comment: adminNote || null,
    },
  );

  if (!rpc.ok) {
    revalidateApplicationPaths(applicationId);
    return { ok: false, error: rpc.error };
  }

  const warnings: string[] = [];

  // Optional highlights; the column comes with migration 20270219120000.
  const { error: fieldsError } = await supabase
    .from("author_applications")
    .update({ revision_fields: revisionFields.length > 0 ? revisionFields : null })
    .eq("id", applicationId);

  if (fieldsError) {
    console.error(
      "author_application_revision_fields_save_failed",
      applicationId,
      fieldsError.message,
    );

    if (revisionFields.length > 0) {
      warnings.push(
        "Отмеченные поля не сохранились в заявке – они перечислены только в письме.",
      );
    }
  }

  const { data: application } = await supabase
    .from("author_applications")
    .select("contact_email, reviewed_at")
    .eq("id", applicationId)
    .maybeSingle();

  const recipientEmail = application?.contact_email?.trim().toLowerCase() || null;
  const revisionAttempt = application?.reviewed_at
    ? String(application.reviewed_at)
    : new Date().toISOString();

  if (recipientEmail) {
    const emailResult = await sendAuthorApplicationNeedsChangesEmail({
      toEmail: recipientEmail,
      applicationId,
      revisionAttempt,
      reviewComment,
      // display_name is the project name (often the very thing to fix), not
      // a person – keep the neutral «Здравствуйте!».
      applicantName: null,
      fieldLabels: getAuthorApplicationRevisionFieldLabels(revisionFields),
    });

    if (!emailResult.ok) {
      console.error(
        "author_application_needs_changes_email_failed",
        applicationId,
        emailResult.code,
      );
      warnings.push(
        "Статус изменён, но письмо заявителю не удалось отправить. Проверьте SMTP и при необходимости сообщите заявителю вручную.",
      );
    }
  } else {
    warnings.push(
      "Статус изменён, но контактный email в заявке не указан – письмо не отправлено.",
    );
  }

  revalidateApplicationPaths(applicationId);

  return {
    ok: true,
    message:
      warnings.length > 0
        ? "Заявка отправлена на доработку."
        : "Заявка отправлена на доработку. Письмо заявителю отправлено.",
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
  };
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
  await requireAdminPermission("authors.manage");

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

  await drainPartnerActivationEmailIfNeeded(rpc.result);

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
        "Доступ выдан, но контактный email в заявке не указан – письмо не отправлено.";
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
  // Legacy action name retained for the admin form; sends author_application_approved mail.
  await requireAdminPermission("authors.manage");

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
  await requireAdminPermission("authors.manage");

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
  await requireAdminPermission("authors.manage");

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
  await requireAdminPermission("authors.manage");

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
