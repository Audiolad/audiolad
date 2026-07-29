import type { SupabaseClient } from "@supabase/supabase-js";

import { PrivateAudioApiError } from "@/lib/private-audio/server/errors";

export async function requirePrivateAudioUser(
  supabase: SupabaseClient,
): Promise<{ id: string; email?: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new PrivateAudioApiError("unauthorized", 401);
  }

  return { id: user.id, email: user.email };
}
