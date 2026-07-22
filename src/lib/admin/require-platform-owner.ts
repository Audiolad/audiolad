import {
  fetchUserPlatformRole,
  isPlatformOwnerRole,
} from "@/lib/auth/platform-admin";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export type PlatformOwnerSession = {
  userId: string;
  email: string | null;
};

export async function requirePlatformOwnerAccess(): Promise<PlatformOwnerSession> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/admin/users");
  }

  const role = await fetchUserPlatformRole(supabase, user.id);

  if (!isPlatformOwnerRole(role)) {
    notFound();
  }

  return {
    userId: user.id,
    email: user.email ?? null,
  };
}

export async function getPlatformOwnerSessionIfOwner(): Promise<PlatformOwnerSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const role = await fetchUserPlatformRole(supabase, user.id);

  if (!isPlatformOwnerRole(role)) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
  };
}
