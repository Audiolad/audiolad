import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type LinkExternalIdentityResult =
  | { ok: true; status: "linked" | "already_linked_same_user" }
  | { ok: false; reason: "identity_conflict" | "user_conflict" | "storage_error" };

type LinkExternalIdentityRpcClient = {
  rpc: (
    fn: string,
    args: {
      p_provider: string;
      p_provider_user_id: string;
      p_user_id: string;
    },
  ) => Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

export type LinkExternalIdentityFn = (
  provider: string,
  providerUserId: string,
  userId: string,
) => Promise<LinkExternalIdentityResult>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failStorage(): LinkExternalIdentityResult {
  return { ok: false, reason: "storage_error" };
}

function readStatus(data: unknown): string | null {
  if (typeof data === "string" && data.length > 0) {
    return data;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return null;
  }

  const status = (row as { status?: unknown }).status;
  return typeof status === "string" && status.length > 0 ? status : null;
}

function mapUniqueViolation(
  error: { code?: string; message?: string },
): LinkExternalIdentityResult | null {
  if (error.code !== "23505") {
    return null;
  }

  const hay = `${error.message ?? ""}`.toLowerCase();
  if (
    hay.includes("provider_linked_user") ||
    hay.includes("linked_user_uidx")
  ) {
    return { ok: false, reason: "user_conflict" };
  }

  return { ok: false, reason: "identity_conflict" };
}

function mapRpcStatus(status: string): LinkExternalIdentityResult {
  if (status === "linked" || status === "already_linked_same_user") {
    return { ok: true, status };
  }
  if (status === "identity_already_linked") {
    return { ok: false, reason: "identity_conflict" };
  }
  if (status === "user_already_has_max_identity") {
    return { ok: false, reason: "user_conflict" };
  }
  return failStorage();
}

async function linkExternalIdentityImpl(
  provider: string,
  providerUserId: string,
  userId: string,
  deps: { client?: LinkExternalIdentityRpcClient } = {},
): Promise<LinkExternalIdentityResult> {
  const trimmedProvider = provider.trim();
  const trimmedProviderUserId = providerUserId.trim();
  const trimmedUserId = userId.trim();
  if (
    trimmedProvider.length === 0 ||
    trimmedProviderUserId.length === 0 ||
    !UUID_RE.test(trimmedUserId)
  ) {
    return failStorage();
  }

  try {
    const client: LinkExternalIdentityRpcClient =
      deps.client ??
      (createServiceRoleClient() as unknown as LinkExternalIdentityRpcClient);
    const { data, error } = await client.rpc("link_external_identity", {
      p_provider: trimmedProvider,
      p_provider_user_id: trimmedProviderUserId,
      p_user_id: trimmedUserId,
    });

    if (error) {
      return mapUniqueViolation(error) ?? failStorage();
    }

    const status = readStatus(data);
    if (!status) {
      return failStorage();
    }

    return mapRpcStatus(status);
  } catch {
    return failStorage();
  }
}

let linkImpl: (
  provider: string,
  providerUserId: string,
  userId: string,
  deps?: { client?: LinkExternalIdentityRpcClient },
) => Promise<LinkExternalIdentityResult> = linkExternalIdentityImpl;

export async function linkExternalIdentity(
  provider: string,
  providerUserId: string,
  userId: string,
  deps: { client?: LinkExternalIdentityRpcClient } = {},
): Promise<LinkExternalIdentityResult> {
  return linkImpl(provider, providerUserId, userId, deps);
}

export function setLinkExternalIdentityForTests(
  fn: LinkExternalIdentityFn | null,
): void {
  if (fn === null) {
    linkImpl = linkExternalIdentityImpl;
    return;
  }

  linkImpl = (provider, providerUserId, userId) =>
    fn(provider, providerUserId, userId);
}
