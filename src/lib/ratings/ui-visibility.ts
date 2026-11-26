import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePracticeRatingsUiEnabled } from "./ui-visibility-policy";

export { resolvePracticeRatingsUiEnabled } from "./ui-visibility-policy";

export async function resolvePracticeRatingsUiEnabledForPractice(
  _client: SupabaseClient,
  practice: {
    id: string;
    publication_class?: string | null;
    product_kind?: string | null;
  },
): Promise<boolean> {
  return resolvePracticeRatingsUiEnabled({
    productKind: practice.product_kind,
  });
}