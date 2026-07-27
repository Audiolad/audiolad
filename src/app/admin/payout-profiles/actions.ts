"use server";

import { revalidatePath } from "next/cache";

import type { AdminPayoutProfileActionState } from "@/app/admin/payout-profiles/action-state";
import { requireAdminPermission } from "@/lib/admin/guard";
import { isPayoutProfilesEnabled } from "@/lib/author-payout-profiles/feature";
import { staffTransitionPayoutProfile } from "@/lib/author-payout-profiles/service";
import { sendPayoutProfileAuthorStatusEmail } from "@/lib/email/send-payout-profile-author-status-email";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function revalidatePayoutProfilePaths(profileId: string) {
  revalidatePath("/admin/payout-profiles");
  revalidatePath(`/admin/payout-profiles/${profileId}`);
  revalidatePath("/admin");
  revalidatePath("/author-dashboard");
  revalidatePath("/author-dashboard/commercial/payout-details");
}

async function resolveAuthorRecipientEmail(
  service: ReturnType<typeof createServiceRoleClient>,
  authorId: string,
): Promise<{ email: string | null; authorName: string | null }> {
  const [authorResult, memberResult] = await Promise.all([
    service.from("authors").select("name").eq("id", authorId).maybeSingle(),
    service
      .from("author_members")
      .select("user_id, role")
      .eq("author_id", authorId)
      .in("role", ["owner", "editor"])
      .order("role", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const authorName = authorResult.data?.name?.trim() || null;
  const userId = memberResult.data?.user_id as string | undefined;

  if (!userId) {
    return { email: null, authorName };
  }

  const { data: profile } = await service
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  return {
    email: profile?.email?.trim().toLowerCase() || null,
    authorName:
      authorName ||
      profile?.full_name?.trim() ||
      null,
  };
}

async function runStaffTransition(
  profileId: string,
  toStatus: "in_review" | "needs_changes" | "verified" | "rejected",
  input: {
    reviewComment?: string;
    staffNote?: string;
    emailKind?: "needs_changes" | "verified" | "rejected";
    successMessage: string;
  },
): Promise<AdminPayoutProfileActionState> {
  const session = await requireAdminPermission("authors.payout_profiles.review");

  if (!isPayoutProfilesEnabled()) {
    return {
      ok: false,
      error: "Сбор и проверка данных для выплат пока отключены.",
    };
  }

  if (!profileId) {
    return { ok: false, error: "Не удалось определить анкету." };
  }

  const service = createServiceRoleClient();

  let warning: string | undefined;

  try {
    const result = await staffTransitionPayoutProfile({
      supabase: service,
      profileId,
      actorUserId: session.userId,
      toStatus,
      reviewComment: input.reviewComment ?? null,
      staffNote: input.staffNote ?? null,
    });

    revalidatePayoutProfilePaths(profileId);

    if (result.transitioned && input.emailKind) {
      try {
        const { email, authorName } = await resolveAuthorRecipientEmail(
          service,
          result.detail.author_id,
        );

        if (email) {
          const emailResult = await sendPayoutProfileAuthorStatusEmail({
            toEmail: email,
            profileId: result.detail.id,
            profileVersion: result.detail.version,
            kind: input.emailKind,
            authorName,
            siteOrigin: getAppOrigin(),
            supabase: service,
          });

          if (!emailResult.ok) {
            console.error(
              "payout_profile_author_status_email_failed",
              profileId,
              emailResult.code,
            );
            warning =
              "Статус обновлён, но письмо автору не удалось отправить. Проверьте SMTP и при необходимости сообщите автору вручную.";
          }
        } else {
          warning =
            "Статус обновлён, но email автора не найден — письмо не отправлено.";
        }
      } catch (error) {
        console.error(
          "payout_profile_author_status_email_unexpected",
          profileId,
          error,
        );
        warning =
          "Статус обновлён, но письмо автору не удалось отправить из‑за внутренней ошибки.";
      }
    }

    return {
      ok: true,
      message: result.transitioned
        ? input.successMessage
        : "Статус уже был обновлён ранее.",
      warning,
    };
  } catch (error) {
    console.error("admin_payout_profile_action_failed", error);
    return { ok: false, error: "Не удалось обновить статус анкеты." };
  }
}

export async function takePayoutProfileInReview(
  _prevState: AdminPayoutProfileActionState,
  formData: FormData,
): Promise<AdminPayoutProfileActionState> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const staffNote = String(formData.get("staffNote") ?? "").trim();

  return runStaffTransition(profileId, "in_review", {
    staffNote,
    successMessage: "Анкета взята в работу.",
  });
}

export async function requestPayoutProfileChanges(
  _prevState: AdminPayoutProfileActionState,
  formData: FormData,
): Promise<AdminPayoutProfileActionState> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const staffNote = String(formData.get("staffNote") ?? "").trim();
  const reviewComment = String(formData.get("reviewComment") ?? "").trim();

  if (!reviewComment) {
    return { ok: false, error: "Укажите комментарий для автора." };
  }

  return runStaffTransition(profileId, "needs_changes", {
    staffNote,
    reviewComment,
    emailKind: "needs_changes",
    successMessage: "Запрос изменений отправлен автору.",
  });
}

export async function verifyPayoutProfile(
  _prevState: AdminPayoutProfileActionState,
  formData: FormData,
): Promise<AdminPayoutProfileActionState> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const staffNote = String(formData.get("staffNote") ?? "").trim();

  return runStaffTransition(profileId, "verified", {
    staffNote,
    emailKind: "verified",
    successMessage: "Данные для выплат подтверждены.",
  });
}

export async function rejectPayoutProfile(
  _prevState: AdminPayoutProfileActionState,
  formData: FormData,
): Promise<AdminPayoutProfileActionState> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const staffNote = String(formData.get("staffNote") ?? "").trim();
  const reviewComment = String(formData.get("reviewComment") ?? "").trim();

  if (!reviewComment) {
    return { ok: false, error: "Укажите причину отклонения для автора." };
  }

  return runStaffTransition(profileId, "rejected", {
    staffNote,
    reviewComment,
    emailKind: "rejected",
    successMessage: "Анкета отклонена.",
  });
}
