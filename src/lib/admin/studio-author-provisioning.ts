import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAdminExactUuid } from "@/lib/admin/users-search";
import { drainPartnerActivationEmailIfNeeded } from "@/lib/author-partner/activation-email-drain";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTHOR_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type StudioOwner = {
  id: string;
  email: string | null;
  displayName: string | null;
};

export type StudioProvisionResult = {
  authorId: string;
  slug: string;
  name: string;
  ownerUserId: string;
};

export function validateStudioProvisionInput(input: {
  name: string;
  slug: string;
  owner: string;
}): { ok: true; name: string; slug: string; owner: string } | { ok: false; error: string } {
  const name = input.name.trim();
  const slug = input.slug.trim();
  const owner = input.owner.trim();

  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: "Название студии должно содержать от 2 до 100 символов." };
  }

  if (slug.length < 2 || !AUTHOR_SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: "Slug должен состоять из строчных латинских букв, цифр и дефисов.",
    };
  }

  if (!isAdminExactUuid(owner) && !EMAIL_RE.test(owner)) {
    return { ok: false, error: "Укажите UUID или email существующего пользователя." };
  }

  return { ok: true, name, slug, owner };
}

export async function resolveStudioOwner(owner: string): Promise<StudioOwner | null> {
  const service = createServiceRoleClient();
  let userId: string | null = null;
  let profile: { id: string; email: string | null; full_name: string | null } | null = null;

  if (isAdminExactUuid(owner)) {
    userId = owner;
    const { data } = await service
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", userId)
      .maybeSingle();
    profile = data;
  } else {
    const { data, error } = await service
      .from("profiles")
      .select("id, email, full_name")
      .ilike("email", owner)
      .maybeSingle();
    if (error || !data) return null;
    profile = data;
    userId = data.id;
  }

  if (!userId) return null;

  const { data: authData, error: authError } = await service.auth.admin.getUserById(userId);
  if (authError || !authData.user) return null;

  return {
    id: authData.user.id,
    email: authData.user.email ?? profile?.email ?? null,
    displayName: profile?.full_name ?? null,
  };
}

export function parseStudioProvisionResult(data: unknown): StudioProvisionResult | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;

  if (
    row.ok !== true ||
    typeof row.author_id !== "string" ||
    typeof row.slug !== "string" ||
    typeof row.name !== "string" ||
    typeof row.owner_user_id !== "string"
  ) {
    return null;
  }

  return {
    authorId: row.author_id,
    slug: row.slug,
    name: row.name,
    ownerUserId: row.owner_user_id,
  };
}

export function mapStudioProvisionError(message: string): string {
  if (message.includes("forbidden")) return "Недостаточно прав для создания студии.";
  if (message.includes("studio_slug_taken")) return "Этот slug уже занят.";
  if (message.includes("owner_user_not_found")) return "Пользователь-владелец не найден.";
  if (message.includes("invalid_studio_name")) return "Некорректное название студии.";
  if (message.includes("invalid_studio_slug")) return "Некорректный slug.";
  return "Не удалось создать авторское пространство. Попробуйте ещё раз.";
}

export async function provisionStudioAuthorWorkspace(
  supabase: SupabaseClient,
  input: { name: string; slug: string; ownerUserId: string },
): Promise<{ ok: true; result: StudioProvisionResult } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("provision_studio_author_workspace", {
    p_name: input.name,
    p_slug: input.slug,
    p_owner_user_id: input.ownerUserId,
  });

  if (error) {
    console.error("studio_author_workspace_provision_failed", error.message);
    return { ok: false, error: mapStudioProvisionError(error.message) };
  }

  const result = parseStudioProvisionResult(data);
  if (result) {
    await drainPartnerActivationEmailIfNeeded(data);
  }
  return result
    ? { ok: true, result }
    : { ok: false, error: "Не удалось создать авторское пространство. Попробуйте ещё раз." };
}
