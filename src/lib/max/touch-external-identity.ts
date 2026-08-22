import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const MAX_EXTERNAL_IDENTITY_PROVIDER = "max";

export type TouchExternalIdentityResult =
  | { ok: true; linked: boolean }
  | { ok: false; reason: "storage_unavailable" };

type TouchExternalIdentityRpcClient = {
  rpc: (
    fn: string,
    args: { p_provider: string; p_provider_user_id: string },
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type TouchExternalIdentityFn = (
  provider: string,
  providerUserId: string,
) => Promise<TouchExternalIdentityResult>;

function failStorage(): TouchExternalIdentityResult {
  return { ok: false, reason: "storage_unavailable" };
}

function readLinkedFlag(data: unknown): boolean | null {
  if (typeof data === "boolean") {
    return data;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return null;
  }

  const linked = (row as { linked?: unknown }).linked;
  return typeof linked === "boolean" ? linked : null;
}

async function touchExternalIdentityImpl(
  provider: string,
  providerUserId: string,
  deps: { client?: TouchExternalIdentityRpcClient } = {},
): Promise<TouchExternalIdentityResult> {
  const trimmedProvider = provider.trim();
  const trimmedProviderUserId = providerUserId.trim();
  if (trimmedProvider.length === 0 || trimmedProviderUserId.length === 0) {
    return failStorage();
  }

  try {
    const client = deps.client ?? createServiceRoleClient();
    const { data, error } = await client.rpc("touch_external_identity", {
      p_provider: trimmedProvider,
      p_provider_user_id: trimmedProviderUserId,
    });

    if (error) {
      return failStorage();
    }

    const linked = readLinkedFlag(data);
    if (linked === null) {
      return failStorage();
    }

    return { ok: true, linked };
  } catch {
    return failStorage();
  }
}

let touchImpl: (
  provider: string,
  providerUserId: string,
  deps?: { client?: TouchExternalIdentityRpcClient },
) => Promise<TouchExternalIdentityResult> = touchExternalIdentityImpl;

export async function touchExternalIdentity(
  provider: string,
  providerUserId: string,
  deps: { client?: TouchExternalIdentityRpcClient } = {},
): Promise<TouchExternalIdentityResult> {
  return touchImpl(provider, providerUserId, deps);
}

export function setTouchExternalIdentityForTests(
  fn: TouchExternalIdentityFn | null,
): void {
  if (fn === null) {
    touchImpl = touchExternalIdentityImpl;
    return;
  }

  touchImpl = (provider, providerUserId) => fn(provider, providerUserId);
}
