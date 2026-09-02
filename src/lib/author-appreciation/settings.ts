import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveAuthorAppreciationSettings,
  type AuthorAppreciationSettings,
} from "./effective-visibility";

type AuthorAppreciationSettingsRow = {
  listener_appreciation_enabled: boolean;
  listener_appreciation_profile_enabled: boolean;
  listener_appreciation_free_products_default: boolean;
};

export async function loadAuthorAppreciationSettings(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorAppreciationSettings> {
  const { data, error } = await supabase
    .from("author_appreciation_settings")
    .select(
      "listener_appreciation_enabled, listener_appreciation_profile_enabled, listener_appreciation_free_products_default",
    )
    .eq("author_id", authorId)
    .maybeSingle();

  if (error) {
    throw new Error("author_appreciation_settings_load_failed");
  }

  const row = data as AuthorAppreciationSettingsRow | null;
  return resolveAuthorAppreciationSettings(
    row
      ? {
          enabled: row.listener_appreciation_enabled,
          profileEnabled: row.listener_appreciation_profile_enabled,
          freeProductsDefault: row.listener_appreciation_free_products_default,
        }
      : null,
  );
}
