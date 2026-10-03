import "server-only";

import { forbidden, notFound, redirect } from "next/navigation";

import {
  getPlatformAccess,
  snapshotHasPermission,
  type PlatformAccessSnapshot,
} from "@/lib/auth/platform-access";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClassicaProductionSession = {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
  access: PlatformAccessSnapshot;
};

export function classicaCanOperate(access: PlatformAccessSnapshot): boolean {
  return snapshotHasPermission(access, "classica.production.operate");
}

export function classicaCanModerate(access: PlatformAccessSnapshot): boolean {
  return snapshotHasPermission(access, "classica.production.moderate");
}

export function classicaCanAdmin(access: PlatformAccessSnapshot): boolean {
  return snapshotHasPermission(access, "classica.production.admin");
}

export async function requireClassicaProductionAccess(): Promise<ClassicaProductionSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/classica/production");
  }

  const access = await getPlatformAccess(supabase, user.id);
  if (!snapshotHasPermission(access, "classica.production.access")) {
    notFound();
  }

  return {
    supabase,
    userId: user.id,
    email: user.email ?? null,
    access,
  };
}

export async function requireClassicaAdmin(): Promise<ClassicaProductionSession> {
  const session = await requireClassicaProductionAccess();
  if (!classicaCanAdmin(session.access)) {
    forbidden();
  }
  return session;
}
