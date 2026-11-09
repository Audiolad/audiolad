"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AUTHOR_SUPPORT_COOKIE_NAME } from "@/lib/author-support/policy";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { businessHallDeviceLocked } from "@/lib/business-app/cabinet-mode.server";
import { validateBusinessProfile } from "@/lib/business-app/profile";
import { isVenueTimezone } from "@/lib/business-app/venue-timezones";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Saves the owner name and required surname (auth user_metadata.first_name / last_name) and the
 * account-level cafe / organization name (`business_organizations.name` via owner-only
 * `rename_business_organization`). Hall / venue names are never read or written here
 * (Sergey, t1316u) – they are edited in the venue place form. Surname is required on save
 * (Sergey, t1305s9421). Existing empty surnames keep music; the home/profile prompt asks
 * the owner to fill it without blocking playback.
 */
export async function saveBusinessProfile(input: {
  ownerName: string; ownerSurname: string; organizationName: string | null;
}) {
  const parsed = validateBusinessProfile(input);
  if (!parsed.ok) return parsed;
  if ((await cookies()).has(AUTHOR_SUPPORT_COOKIE_NAME) || await businessHallDeviceLocked()) {
    return { ok: false, error: "Изменить профиль можно в личном кабинете владельца." } as const;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Войдите в аккаунт ещё раз." } as const;
  const domain = await loadBusinessOwnerHomeContext();
  if (domain.status !== "authenticated") return { ok: false, error: "Войдите в аккаунт ещё раз." } as const;

  let organizationName = domain.organizationName;
  if (domain.organizationId && parsed.organizationName !== null) {
    const next = parsed.organizationName;
    if (next !== (domain.organizationName?.trim() ?? "")) {
      const { data, error } = await supabase.rpc("rename_business_organization", {
        p_organization_id: domain.organizationId, p_name: next,
      });
      if (error?.code === "42501") {
        return { ok: false, error: "Название кофейни / организации может изменить только владелец." } as const;
      }
      if (error || !(data as { ok?: boolean } | null)?.ok) {
        return { ok: false, error: "Не удалось сохранить название кофейни / организации. Попробуйте ещё раз." } as const;
      }
      organizationName = (data as { name?: string } | null)?.name ?? next;
    } else {
      organizationName = next;
    }
  } else if (!domain.organizationId) {
    organizationName = null;
  }

  const { error } = await supabase.auth.updateUser({
    data: { first_name: parsed.ownerName, last_name: parsed.ownerSurname },
  });
  if (error) {
    // Auth and public data cannot share a transaction. Be explicit about a partial save.
    return { ok: false, error: "Имя и фамилия не сохранены. Название кофейни / организации могло сохраниться. Повторите попытку." } as const;
  }
  // The client refreshes the RSC payload, including the layout domain provider, without
  // invalidating/remounting the persistent cabinet player.
  return {
    ok: true,
    ownerName: parsed.ownerName,
    ownerSurname: parsed.ownerSurname,
    organizationName,
  } as const;
}

/**
 * Owner-only: the venue clock for opening hours (time-of-day atmosphere), documents and the
 * subscription calendar. Only the 11 Russian zones of `VENUE_TIMEZONES` are accepted.
 * `business_locations` has no UPDATE grant for `authenticated`, so after the owner check
 * (from the session, never from the form) the single column is written with the service role.
 * Players re-read the zone on their next sound poll and switch the daypart at the next track
 * boundary; playback is never stopped.
 */
export async function saveBusinessTimezone(input: { timezone: string }) {
  const timezone = typeof input?.timezone === "string" ? input.timezone.trim() : "";
  if (!isVenueTimezone(timezone)) return { ok: false, error: "Выберите часовой пояс из списка." } as const;
  if ((await cookies()).has(AUTHOR_SUPPORT_COOKIE_NAME) || await businessHallDeviceLocked()) {
    return { ok: false, error: "Часовой пояс меняет владелец в личном кабинете." } as const;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Войдите в аккаунт ещё раз." } as const;
  const domain = await loadBusinessOwnerHomeContext();
  if (domain.status !== "authenticated" || !domain.location) {
    return { ok: false, error: "Кофейня ещё не подключена." } as const;
  }
  const location = domain.location;
  const { data: membership, error: memberError } = await supabase.from("business_organization_members")
    .select("role").eq("organization_id", location.organizationId).eq("user_id", user.id).maybeSingle();
  if (memberError) return { ok: false, error: "Не удалось сохранить часовой пояс. Попробуйте ещё раз." } as const;
  if ((membership as { role?: string } | null)?.role !== "owner") {
    return { ok: false, error: "Часовой пояс может изменить только владелец." } as const;
  }
  if (location.timezone === timezone) return { ok: true, timezone } as const;
  const { error } = await createServiceRoleClient().from("business_locations")
    .update({ timezone }).eq("id", location.id).eq("organization_id", location.organizationId);
  if (error) return { ok: false, error: "Не удалось сохранить часовой пояс. Попробуйте ещё раз." } as const;
  return { ok: true, timezone } as const;
}
