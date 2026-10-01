import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
import { toMaxProfileDto, type MaxProfileDto } from "@/lib/max/profile";
import { getProfilePageData } from "@/lib/profile/queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";

type ProfileUserRecord = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type ProfileService = {
  auth: {
    admin: {
      getUserById: (userId: string) => Promise<{
        data: { user: ProfileUserRecord | null };
        error: { message?: string } | null;
      }>;
    };
  };
};

type ProfileDeps = {
  createClient?: () => ProfileService;
  getProfilePageData?: (
    supabase: SupabaseClient,
    user: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    },
  ) => Promise<Parameters<typeof toMaxProfileDto>[0]>;
};

let profileDeps: ProfileDeps | null = null;

export function setMaxProfileDepsForTests(deps: ProfileDeps | null) {
  profileDeps = deps;
}

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function serviceClient(): ProfileService {
  if (profileDeps?.createClient) return profileDeps.createClient();
  return createServiceRoleClient() as unknown as ProfileService;
}

function displayMetadata(value: unknown): {
  first_name?: string;
  last_name?: string;
  full_name?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const pick = (key: string) =>
    typeof record[key] === "string" ? record[key] : undefined;
  return {
    first_name: pick("first_name"),
    last_name: pick("last_name"),
    full_name: pick("full_name"),
  };
}

export async function loadMaxLinkedProfile(userId: string): Promise<MaxProfileDto> {
  const service = serviceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user || data.user.id !== userId) {
    throw new Error("max_profile_user_lookup_failed");
  }

  const load = profileDeps?.getProfilePageData ?? getProfilePageData;
  const page = await load(service as unknown as SupabaseClient, {
    id: userId,
    email: data.user.email ?? undefined,
    user_metadata: displayMetadata(data.user.user_metadata),
  });
  return toMaxProfileDto(page);
}

export async function POST(request: Request) {
  try {
    const authenticated = await readMaxAuthenticatedPost(request, []);
    if (!authenticated.ok) return authenticated.response;

    const profile = await loadMaxLinkedProfile(authenticated.userId);
    return Response.json(
      { ok: true, profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return fail("storage_unavailable", 503);
  }
}
