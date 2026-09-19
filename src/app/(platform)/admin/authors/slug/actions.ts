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
  step?: "preview" | "done";
  message?: string;
  error?: string;
  authorId?: string;
  authorName?: string;
  previousSlug?: string;
  slug?: string;
};

export const CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE: ChangeAuthorSlugAdminState =
  { ok: false };

function parseAuthorLookup(raw: string): {
  kind: "uuid" | "slug";
  value: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRe.test(trimmed)) {
    return { kind: "uuid", value: trimmed.toLowerCase() };
  }

  let candidate = trimmed;
  try {
    if (candidate.includes("://") || candidate.startsWith("/")) {
      const url = candidate.includes("://")
        ? new URL(candidate)
        : new URL(candidate, "https://audiolad.local");
      const parts = url.pathname.split("/").filter(Boolean);
      const authorsIdx = parts.findIndex((part) => part === "authors");
      if (authorsIdx >= 0 && parts[authorsIdx + 1]) {
        candidate = parts[authorsIdx + 1];
      }
    }
  } catch {
    // keep candidate as typed
  }

  const slug = normalizeAuthorSpaceSlugInput(candidate);
  if (!slug) return null;
  return { kind: "slug", value: slug };
}

async function resolveAuthor(
  lookupRaw: string,
): Promise<
  | { ok: true; id: string; name: string; slug: string }
  | { ok: false; error: string }
> {
  const parsed = parseAuthorLookup(lookupRaw);
  if (!parsed) {
    return {
      ok: false,
      error: "Укажите UUID, текущий slug или ссылку /authors/{slug}.",
    };
  }

  const supabase = await createClient();
  const query = supabase.from("authors").select("id, name, slug");
  const { data, error } =
    parsed.kind === "uuid"
      ? await query.eq("id", parsed.value).maybeSingle()
      : await query.eq("slug", parsed.value).maybeSingle();

  if (error) {
    return { ok: false, error: "Не удалось найти авторское пространство." };
  }
  if (!data?.id || !data.slug) {
    return { ok: false, error: "Авторское пространство не найдено." };
  }

  return {
    ok: true,
    id: data.id,
    name: typeof data.name === "string" ? data.name : data.slug,
    slug: data.slug,
  };
}

export async function previewAuthorSlugChangeAsAdmin(
  _previous: ChangeAuthorSlugAdminState,
  formData: FormData,
): Promise<ChangeAuthorSlugAdminState> {
  await requireAdminPermission("authors.manage");

  const lookupRaw = String(formData.get("author_lookup") ?? "");
  const slugRaw = String(formData.get("slug") ?? "");
  const normalized = normalizeAuthorSpaceSlugInput(slugRaw);

  if (!normalized) {
    return { ok: false, error: "Некорректный новый slug." };
  }

  const author = await resolveAuthor(lookupRaw);
  if (!author.ok) {
    return { ok: false, error: author.error };
  }

  return {
    ok: true,
    step: "preview",
    authorId: author.id,
    authorName: author.name,
    previousSlug: author.slug,
    slug: normalized,
    message: `Было «${author.slug}» → Станет «${normalized}» (${author.name}).`,
  };
}

export async function confirmAuthorSlugChangeAsAdmin(
  _previous: ChangeAuthorSlugAdminState,
  formData: FormData,
): Promise<ChangeAuthorSlugAdminState> {
  await requireAdminPermission("authors.manage");

  const authorId = String(formData.get("author_id") ?? "").trim();
  const previousSlug = String(formData.get("previous_slug") ?? "").trim();
  const confirmed = String(formData.get("confirm") ?? "") === "yes";
  const slugRaw = String(formData.get("slug") ?? "");
  const normalized = normalizeAuthorSpaceSlugInput(slugRaw);

  if (!confirmed) {
    return { ok: false, error: "Подтвердите смену slug." };
  }
  if (!authorId || !normalized) {
    return { ok: false, error: "Некорректные данные подтверждения." };
  }

  const supabase = await createClient();
  const result = await changeAuthorSlug(supabase, authorId, normalized);

  if (!result.ok) {
    return {
      ok: false,
      step: "preview",
      authorId,
      previousSlug: previousSlug || undefined,
      slug: normalized,
      error: humanizeAuthorSpaceEligibility({
        allowed: false,
        code: result.code,
      }),
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
    step: "done",
    message: payload.noop
      ? "Slug уже актуален — изменений нет."
      : `Slug обновлён: ${payload.previousSlug} → ${payload.slug}. Старый адрес будет 308-редиректить на новый.`,
    previousSlug: payload.previousSlug,
    slug: payload.slug,
    authorId: payload.authorId,
  };
}
