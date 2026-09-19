"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/admin/guard";
import {
  changeAuthorSlug,
  humanizeAuthorSpaceEligibility,
  normalizeAuthorSpaceSlugInput,
} from "@/lib/authors/space-ops";
import { buildAuthorPublicPath } from "@/lib/products/paths";
import {
  buildAuthorCanonicalUrl,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import { createClient } from "@/lib/supabase/server";

export type ChangeAuthorSlugAdminState = {
  ok: boolean;
  message?: string;
  error?: string;
  previousSlug?: string;
  slug?: string;
  authorId?: string;
};

export const CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE: ChangeAuthorSlugAdminState =
  { ok: false };

export async function changeAuthorSlugAsAdmin(
  _previous: ChangeAuthorSlugAdminState,
  formData: FormData,
): Promise<ChangeAuthorSlugAdminState> {
  await requireAdminPermission("authors.manage");

  const authorId = String(formData.get("author_id") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "");
  const normalized = normalizeAuthorSpaceSlugInput(slugRaw);

  if (!authorId) {
    return { ok: false, error: "Укажите UUID авторского пространства." };
  }
  if (!normalized) {
    return { ok: false, error: "Некорректный slug." };
  }

  const supabase = await createClient();
  const result = await changeAuthorSlug(supabase, authorId, normalized);

  if (!result.ok) {
    return {
      ok: false,
      error: humanizeAuthorSpaceEligibility({
        allowed: false,
        code: result.code,
      }),
      authorId,
    };
  }

  const payload = result.result;
  revalidatePath(buildAuthorPublicPath(payload.slug));
  if (!payload.noop && payload.previousSlug !== payload.slug) {
    revalidatePath(buildAuthorPublicPath(payload.previousSlug));
  }
  revalidatePath("/authors");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/authors/slug");

  if (!payload.noop) {
    scheduleIndexNowNotification(
      [
        buildAuthorCanonicalUrl(payload.slug),
        buildAuthorCanonicalUrl(payload.previousSlug),
      ],
      INDEXNOW_REASONS.author_profile_updated,
    );
  }

  return {
    ok: true,
    message: payload.noop
      ? "Slug уже актуален — изменений нет."
      : `Slug обновлён: ${payload.previousSlug} → ${payload.slug}. Старый адрес будет 308-редиректить на новый.`,
    previousSlug: payload.previousSlug,
    slug: payload.slug,
    authorId: payload.authorId,
  };
}
