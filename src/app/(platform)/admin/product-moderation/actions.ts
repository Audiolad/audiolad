"use server";

import { revalidatePath } from "next/cache";

import type { AdminProductModerationActionState } from "@/app/(platform)/admin/product-moderation/action-state";
import { requireAdminPermission } from "@/lib/admin/guard";
import { getAdminProductModerationDetail } from "@/lib/admin/product-moderation-queries";
import {
  approveAndPublishPractice,
  requestPracticeChanges,
} from "@/lib/author-products/admin-moderation-actions";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { createClient } from "@/lib/supabase/server";

function revalidateProductModerationPaths(practiceId: string) {
  revalidatePath("/admin/product-moderation");
  revalidatePath(`/admin/product-moderation/${practiceId}`);
  revalidatePath("/admin");
  revalidatePath("/author-dashboard");
  revalidatePath("/catalog");
  revalidatePath("/sitemap.xml");
}

export async function approveAndPublishProductAction(
  _prevState: AdminProductModerationActionState,
  formData: FormData,
): Promise<AdminProductModerationActionState> {
  const session = await requireAdminPermission("author_products.moderate");
  const practiceId = String(formData.get("practiceId") ?? "").trim();

  if (!practiceId) {
    return { ok: false, error: "Не удалось определить продукт." };
  }

  const supabase = await createClient();

  try {
    await approveAndPublishPractice(supabase, practiceId);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      const mapped = error as { message: string; code?: string };
      console.info("admin_product_moderation_approve_failed", {
        practiceId,
        adminUserId: session.userId,
        code: mapped.code ?? null,
      });
      return { ok: false, error: mapped.message };
    }

    console.error("admin_product_moderation_approve_error", practiceId, error);
    return { ok: false, error: "Не удалось одобрить продукт." };
  }

  const detail = await getAdminProductModerationDetail(practiceId);
  const publicPath =
    detail?.authorSlug && detail.slug
      ? buildPracticePublicPath(detail.authorSlug, detail.slug)
      : undefined;

  console.info("admin_product_moderation_approved", {
    practiceId,
    authorId: detail?.authorId ?? null,
    adminUserId: session.userId,
    action: "approved_and_published",
    attempt: detail?.moderationAttempt ?? null,
  });

  revalidateProductModerationPaths(practiceId);

  return {
    ok: true,
    message: "Продукт одобрен и опубликован.",
    publicPath,
  };
}

export async function requestProductChangesAction(
  _prevState: AdminProductModerationActionState,
  formData: FormData,
): Promise<AdminProductModerationActionState> {
  const session = await requireAdminPermission("author_products.moderate");
  const practiceId = String(formData.get("practiceId") ?? "").trim();
  const comment = String(formData.get("reviewComment") ?? "").trim();

  if (!practiceId) {
    return { ok: false, error: "Не удалось определить продукт." };
  }

  if (comment.length < 10) {
    return {
      ok: false,
      error: "Укажите комментарий для автора не короче 10 символов.",
    };
  }

  const supabase = await createClient();

  try {
    await requestPracticeChanges(supabase, practiceId, comment);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      const mapped = error as { message: string; code?: string };
      console.info("admin_product_moderation_changes_failed", {
        practiceId,
        adminUserId: session.userId,
        code: mapped.code ?? null,
      });
      return { ok: false, error: mapped.message };
    }

    console.error("admin_product_moderation_changes_error", practiceId, error);
    return { ok: false, error: "Не удалось отправить замечания автору." };
  }

  console.info("admin_product_moderation_changes_requested", {
    practiceId,
    adminUserId: session.userId,
    action: "changes_requested",
  });

  revalidateProductModerationPaths(practiceId);

  return {
    ok: true,
    message: "Автору отправлен запрос на изменения.",
  };
}
