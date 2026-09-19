import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { validateAuthorProjectSlug } from "@/lib/author-projects/slug";
import {
  buildAuthorPublicPath,
  buildListenPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";

export type AuthorSpaceEligibilityCode =
  | "ok"
  | "forbidden"
  | "slug_change_locked_published"
  | "slug_change_locked_finance"
  | "delete_blocked"
  | "author_not_found"
  | "slug_invalid"
  | "slug_taken"
  | "slug_change_locked"
  | "delete_blocked_dependency"
  | "internal_error";

export type AuthorSpaceEligibility = {
  allowed: boolean;
  code: AuthorSpaceEligibilityCode;
  asAdmin?: boolean;
  blockers?: string[];
};

export type ChangeAuthorSlugResult = {
  ok: true;
  noop: boolean;
  authorId: string;
  slug: string;
  previousSlug: string;
  name?: string;
};

export type DeleteAuthorSpaceResult = {
  ok: true;
  authorId: string;
  slug: string;
  name: string;
};

export type AuthorSlugRedirectResolution = {
  authorId: string;
  currentSlug: string;
  oldSlug: string;
};

function asEligibility(data: unknown): AuthorSpaceEligibility {
  if (!data || typeof data !== "object") {
    return { allowed: false, code: "internal_error" };
  }
  const row = data as Record<string, unknown>;
  const code =
    typeof row.code === "string"
      ? (row.code as AuthorSpaceEligibilityCode)
      : "internal_error";
  const blockers = Array.isArray(row.blockers)
    ? row.blockers.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    allowed: row.allowed === true,
    code,
    asAdmin: row.as_admin === true,
    blockers,
  };
}

export function humanizeAuthorSpaceEligibility(
  eligibility: AuthorSpaceEligibility,
): string {
  switch (eligibility.code) {
    case "ok":
      return "";
    case "forbidden":
      return "Недостаточно прав для этого действия.";
    case "slug_change_locked_published":
      return "Адрес нельзя изменить после публикации продукта.";
    case "slug_change_locked_finance":
      return "Адрес нельзя изменить, пока у пространства есть финансовая история.";
    case "slug_change_locked":
      return "Адрес страницы больше нельзя изменить.";
    case "delete_blocked":
    case "delete_blocked_dependency": {
      const blockers = eligibility.blockers ?? [];
      if (blockers.includes("has_practices")) {
        return "Авторское пространство нельзя удалить, пока в нём есть продукты.";
      }
      if (blockers.includes("has_finance")) {
        return "Удаление недоступно из-за финансовой истории.";
      }
      return "Удаление недоступно: пространство не пустое.";
    }
    case "slug_invalid":
      return "Некорректный адрес страницы.";
    case "slug_taken":
      return "Этот адрес уже занят.";
    case "author_not_found":
      return "Авторское пространство не найдено.";
    default:
      return "Не удалось выполнить действие. Попробуйте ещё раз.";
  }
}

export function normalizeAuthorSpaceSlugInput(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (validateAuthorProjectSlug(trimmed)) {
    return null;
  }
  return trimmed;
}

export async function getCanChangeAuthorSlug(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorSpaceEligibility> {
  const { data, error } = await supabase.rpc("can_change_author_slug", {
    p_author_id: authorId,
  });
  if (error) {
    console.error("can_change_author_slug_error", error.message);
    return { allowed: false, code: "internal_error" };
  }
  return asEligibility(data);
}

export async function getCanDeleteAuthorSpace(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorSpaceEligibility> {
  const { data, error } = await supabase.rpc("can_delete_author_space", {
    p_author_id: authorId,
  });
  if (error) {
    console.error("can_delete_author_space_error", error.message);
    return { allowed: false, code: "internal_error" };
  }
  return asEligibility(data);
}

function mapRpcError(message: string): AuthorSpaceEligibilityCode {
  const lower = message.toLowerCase();
  if (lower.includes("forbidden")) return "forbidden";
  if (lower.includes("slug_invalid")) return "slug_invalid";
  if (lower.includes("slug_taken")) return "slug_taken";
  if (lower.includes("slug_change_locked")) return "slug_change_locked";
  if (lower.includes("delete_blocked")) return "delete_blocked";
  if (lower.includes("author_not_found")) return "author_not_found";
  return "internal_error";
}

export async function changeAuthorSlug(
  supabase: SupabaseClient,
  authorId: string,
  newSlug: string,
): Promise<
  | { ok: true; result: ChangeAuthorSlugResult }
  | { ok: false; code: AuthorSpaceEligibilityCode }
> {
  const normalized = normalizeAuthorSpaceSlugInput(newSlug);
  if (!normalized) {
    return { ok: false, code: "slug_invalid" };
  }

  const { data, error } = await supabase.rpc("change_author_slug", {
    p_author_id: authorId,
    p_new_slug: normalized,
  });

  if (error) {
    return { ok: false, code: mapRpcError(error.message) };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, code: "internal_error" };
  }

  const row = data as Record<string, unknown>;
  if (row.ok !== true || typeof row.slug !== "string") {
    return { ok: false, code: "internal_error" };
  }

  return {
    ok: true,
    result: {
      ok: true,
      noop: row.noop === true,
      authorId: String(row.author_id ?? authorId),
      slug: row.slug,
      previousSlug: String(row.previous_slug ?? row.slug),
      name: typeof row.name === "string" ? row.name : undefined,
    },
  };
}

export async function deleteEmptyAuthorSpace(
  supabase: SupabaseClient,
  authorId: string,
): Promise<
  | { ok: true; result: DeleteAuthorSpaceResult }
  | { ok: false; code: AuthorSpaceEligibilityCode; blockers?: string[] }
> {
  const { data, error } = await supabase.rpc("delete_empty_author_space", {
    p_author_id: authorId,
  });

  if (error) {
    const code = mapRpcError(error.message);
    const detail =
      typeof error.details === "string"
        ? error.details.split(",").map((part) => part.trim()).filter(Boolean)
        : undefined;
    return { ok: false, code, blockers: detail };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, code: "internal_error" };
  }

  const row = data as Record<string, unknown>;
  if (
    row.ok !== true ||
    typeof row.slug !== "string" ||
    typeof row.name !== "string"
  ) {
    return { ok: false, code: "internal_error" };
  }

  return {
    ok: true,
    result: {
      ok: true,
      authorId: String(row.author_id ?? authorId),
      slug: row.slug,
      name: row.name,
    },
  };
}

export async function resolveAuthorSlugRedirect(
  supabase: SupabaseClient,
  oldSlug: string,
): Promise<AuthorSlugRedirectResolution | null> {
  const slug = oldSlug.trim().toLowerCase();
  if (!slug) {
    return null;
  }

  const { data, error } = await supabase.rpc("resolve_author_slug_redirect", {
    p_old_slug: slug,
  });

  if (error) {
    console.error("resolve_author_slug_redirect_error", error.message);
    return null;
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const row = data as Record<string, unknown>;
  if (
    typeof row.author_id !== "string" ||
    typeof row.current_slug !== "string" ||
    typeof row.old_slug !== "string"
  ) {
    return null;
  }

  if (row.current_slug === row.old_slug) {
    return null;
  }

  return {
    authorId: row.author_id,
    currentSlug: row.current_slug,
    oldSlug: row.old_slug,
  };
}


export function appendQueryString(
  path: string,
  searchParams?: Record<string, string | string[] | undefined> | URLSearchParams | null,
): string {
  if (!searchParams) {
    return path;
  }

  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : (() => {
          const next = new URLSearchParams();
          for (const [key, value] of Object.entries(searchParams)) {
            if (typeof value === "string") {
              next.set(key, value);
            } else if (Array.isArray(value)) {
              for (const item of value) {
                if (typeof item === "string") {
                  next.append(key, item);
                }
              }
            }
          }
          return next;
        })();

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function buildAuthorRedirectTarget(
  currentSlug: string,
  searchParams?: Record<string, string | string[] | undefined> | URLSearchParams | null,
): string {
  return appendQueryString(buildAuthorPublicPath(currentSlug), searchParams);
}

export function buildPracticeRedirectTarget(
  currentAuthorSlug: string,
  productSlug: string,
  searchParams?: Record<string, string | string[] | undefined> | URLSearchParams | null,
): string {
  return appendQueryString(
    buildPracticePublicPath(currentAuthorSlug, productSlug),
    searchParams,
  );
}

export function buildListenRedirectTarget(
  currentAuthorSlug: string,
  productSlug: string,
  searchParams?: Record<string, string | string[] | undefined> | URLSearchParams | null,
): string {
  return appendQueryString(
    buildListenPath(currentAuthorSlug, productSlug),
    searchParams,
  );
}

export async function practiceBelongsToAuthor(
  supabase: SupabaseClient,
  authorId: string,
  productSlug: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("practices")
    .select("id")
    .eq("author_id", authorId)
    .eq("slug", productSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("practice_belongs_to_author_error", error.message);
    return false;
  }

  return Boolean(data?.id);
}
