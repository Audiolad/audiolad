"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AUTHOR_SUPPORT_COOKIE_NAME } from "@/lib/author-support/policy";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { businessPointSessionAlive } from "@/lib/business-app/point-session.server";
import { DEFAULT_BUSINESS_ORGANIZATION, validateBusinessProfile } from "@/lib/business-app/profile";

export async function saveBusinessProfile(input: { ownerName: string; organizationName: string }) {
  const parsed = validateBusinessProfile(input);
  if (!parsed.ok) return parsed;
  if ((await cookies()).has(AUTHOR_SUPPORT_COOKIE_NAME) || await businessPointSessionAlive()) {
    return { ok: false, error: "Изменить профиль можно в личном кабинете владельца." } as const;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Войдите в аккаунт ещё раз." } as const;
  // Resolve the organization on the server. Never trust an id or role from the form.
  const domain = await loadBusinessOwnerHomeContext();
  if (domain.status !== "authenticated") return { ok: false, error: "Войдите в аккаунт ещё раз." } as const;
  const organizationName = parsed.organizationName || DEFAULT_BUSINESS_ORGANIZATION;
  if (domain.organizationId && organizationName !== domain.organizationName) {
    const { error } = await supabase.rpc("rename_business_organization", {
      p_organization_id: domain.organizationId, p_name: organizationName,
    });
    if (error) return { ok: false, error: "Не удалось сохранить организацию. Изменять её может только владелец." } as const;
  }
  const { error } = await supabase.auth.updateUser({ data: { first_name: parsed.ownerName } });
  if (error) {
    // Auth and public data cannot share a transaction. Be explicit about a partial save.
    return { ok: false, error: "Имя не сохранено. Организация могла сохраниться. Повторите попытку." } as const;
  }
  // The client refreshes the RSC payload, including the layout domain provider, without
  // invalidating/remounting the persistent cabinet player.
  return { ok: true, ownerName: parsed.ownerName, organizationName } as const;
}
