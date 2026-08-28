"use server";

import { clearAuthorSupportModeOnLogout } from "@/lib/author-support/actions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signOut() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await clearAuthorSupportModeOnLogout(user.id);
  }

  // Close active analytics identity links before the session ends so
  // User A → logout → User B cannot share one anonymous visitor key.
  await supabase.rpc("unlink_analytics_identity");

  await supabase.auth.signOut({ scope: "local" });

  redirect("/");
}
