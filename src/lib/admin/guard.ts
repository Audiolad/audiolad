import { hasAdminPanelAccess } from "@/lib/auth/platform-admin";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export type AdminSession = {
  userId: string;
  email: string | null;
};

export async function requireAdminPanelAccess(): Promise<AdminSession> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/admin");
  }

  const allowed = await hasAdminPanelAccess(supabase, user.id);

  if (!allowed) {
    notFound();
  }

  return {
    userId: user.id,
    email: user.email ?? null,
  };
}
