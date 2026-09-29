import { isPlatformOwner } from "@/lib/auth/platform-admin";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export type PlatformOwnerSession = {
  userId: string;
  email: string | null;
};

function getSafeAdminReturnPath(nextPath: string): string {
  if (!nextPath.startsWith("/admin") || nextPath.startsWith("//")) {
    return "/admin";
  }

  return nextPath;
}

export async function requirePlatformOwnerAccess(
  nextPath = "/admin/users",
): Promise<PlatformOwnerSession> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const safeNextPath = getSafeAdminReturnPath(nextPath);
    redirect(`/auth/sign-in?next=${encodeURIComponent(safeNextPath)}`);
  }

  const owner = await isPlatformOwner(supabase, user.id);

  if (!owner) {
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

  const owner = await isPlatformOwner(supabase, user.id);

  if (!owner) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
  };
}
