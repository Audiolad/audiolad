import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Read-only: is a device in the hall paired with this venue? Same RPC as the «Настройка»
 * pairing card. Null when it could not be read (Главная then shows no mark).
 */
export async function loadBusinessPointLinked(locationId: string | null): Promise<boolean | null> {
  if (!locationId) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_business_point_link", { p_location_id: locationId });
    if (error || !(data as { ok?: boolean } | null)?.ok) return null;
    return (data as { linked?: boolean }).linked === true;
  } catch {
    return null;
  }
}
