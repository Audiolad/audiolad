import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "@/lib/max/touch-external-identity";

export type UnlinkExternalIdentityResult =
  | { ok: true }
  | { ok: false; reason: "storage_unavailable" };

/**
 * Delete one external identity row. Both filters are required.
 * The AudioLad user id is not an input: callers pass only the provider user
 * id already taken from a verified MAX launch payload.
 */
type UnlinkIdentityClient = {
  from: (table: "external_identities") => {
    delete: () => {
      eq: (
        column: "provider",
        value: string,
      ) => {
        eq: (
          column: "provider_user_id",
          value: string,
        ) => Promise<{ error: { message?: string } | null }>;
      };
    };
  };
};

export type UnlinkExternalIdentityFn = (
  provider: string,
  providerUserId: string,
) => Promise<UnlinkExternalIdentityResult>;

function failStorage(): UnlinkExternalIdentityResult {
  return { ok: false, reason: "storage_unavailable" };
}

async function unlinkExternalIdentityImpl(
  provider: string,
  providerUserId: string,
  deps: { client?: UnlinkIdentityClient } = {},
): Promise<UnlinkExternalIdentityResult> {
  const trimmedProvider = provider.trim();
  const trimmedProviderUserId = providerUserId.trim();
  if (
    trimmedProvider !== MAX_EXTERNAL_IDENTITY_PROVIDER ||
    trimmedProviderUserId.length === 0
  ) {
    return failStorage();
  }

  try {
    const client: UnlinkIdentityClient =
      deps.client ??
      (createServiceRoleClient() as unknown as UnlinkIdentityClient);
    const { error } = await client
      .from("external_identities")
      .delete()
      .eq("provider", trimmedProvider)
      .eq("provider_user_id", trimmedProviderUserId);

    if (error) {
      return failStorage();
    }

    return { ok: true };
  } catch {
    return failStorage();
  }
}

let unlinkImpl: (
  provider: string,
  providerUserId: string,
  deps?: { client?: UnlinkIdentityClient },
) => Promise<UnlinkExternalIdentityResult> = unlinkExternalIdentityImpl;

export async function unlinkExternalIdentity(
  provider: string,
  providerUserId: string,
  deps: { client?: UnlinkIdentityClient } = {},
): Promise<UnlinkExternalIdentityResult> {
  return unlinkImpl(provider, providerUserId, deps);
}

export function setUnlinkExternalIdentityForTests(
  fn: UnlinkExternalIdentityFn | null,
): void {
  if (fn === null) {
    unlinkImpl = unlinkExternalIdentityImpl;
    return;
  }

  unlinkImpl = (provider, providerUserId) => fn(provider, providerUserId);
}
