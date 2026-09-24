import "server-only";

import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type MaxSessionBindingResult =
  | { ok: true; sessionMatches: boolean }
  | { ok: false; reason: "storage_unavailable" };

/**
 * Server-only MAX-native identity resolution. Callers must supply an identity
 * obtained from fresh, verified MAX initData; never from browser input.
 *
 * Future MAX personal APIs must use this linked AudioLad user as their
 * identity authority, not an unrelated Supabase cookie session.
 */
export type ResolveMaxNativeUserResult =
  | { ok: true; userId: string | null }
  | { ok: false; reason: "storage_unavailable" };

type SessionAuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id?: string | null } | null };
      error: unknown;
    }>;
  };
};

type IdentityLookupResult = {
  data: { user_id?: string | null } | null;
  error: { message?: string } | null;
};

export type MaxIdentityLookupClient = {
  from: (table: "external_identities") => {
    select: (columns: "user_id") => {
      eq: (
        column: "provider",
        value: string,
      ) => {
        eq: (
          column: "provider_user_id",
          value: string,
        ) => {
          maybeSingle: () => Promise<IdentityLookupResult>;
        };
      };
    };
  };
};

export type ResolveMaxSessionBindingDeps = {
  getRequestAuthClient?: (request: Request) => Promise<SessionAuthClient>;
  getIdentityClient?: () => MaxIdentityLookupClient;
  linkedUserId?: string | null;
};

export type ResolveMaxSessionBindingFn = (
  request: Request,
  provider: string,
  providerUserId: string,
) => Promise<MaxSessionBindingResult>;

export type ResolveMaxNativeUserFn = (
  provider: string,
  providerUserId: string,
) => Promise<ResolveMaxNativeUserResult>;

function noMatch(): MaxSessionBindingResult {
  return { ok: true, sessionMatches: false };
}

function storageUnavailable(): MaxSessionBindingResult {
  return { ok: false, reason: "storage_unavailable" };
}

function nativeStorageUnavailable(): ResolveMaxNativeUserResult {
  return { ok: false, reason: "storage_unavailable" };
}

async function readSessionUserId(
  request: Request,
  deps: ResolveMaxSessionBindingDeps,
): Promise<string | null> {
  try {
    const supabase = deps.getRequestAuthClient
      ? await deps.getRequestAuthClient(request)
      : ((await createClientFromRequest(request)) as SessionAuthClient);
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return null;
    }
    const id = data.user?.id;
    if (typeof id !== "string" || id.length === 0) {
      return null;
    }
    return id;
  } catch {
    return null;
  }
}

async function resolveMaxNativeUserImpl(
  provider: string,
  providerUserId: string,
  deps: Pick<ResolveMaxSessionBindingDeps, "getIdentityClient"> = {},
): Promise<ResolveMaxNativeUserResult> {
  const trimmedProvider = provider.trim();
  const trimmedProviderUserId = providerUserId.trim();
  if (trimmedProvider.length === 0 || trimmedProviderUserId.length === 0) {
    return nativeStorageUnavailable();
  }

  try {
    const client = deps.getIdentityClient
      ? deps.getIdentityClient()
      : (createServiceRoleClient() as unknown as MaxIdentityLookupClient);
    const { data, error } = await client
      .from("external_identities")
      .select("user_id")
      .eq("provider", trimmedProvider)
      .eq("provider_user_id", trimmedProviderUserId)
      .maybeSingle();

    if (error) {
      return nativeStorageUnavailable();
    }

    const userId = data?.user_id;
    if (typeof userId !== "string" || userId.length === 0) {
      return { ok: true, userId: null };
    }

    return { ok: true, userId };
  } catch {
    return nativeStorageUnavailable();
  }
}

let nativeUserImpl: (
  provider: string,
  providerUserId: string,
  deps?: Pick<ResolveMaxSessionBindingDeps, "getIdentityClient">,
) => Promise<ResolveMaxNativeUserResult> = resolveMaxNativeUserImpl;

export async function resolveMaxNativeUser(
  provider: string,
  providerUserId: string,
  deps: Pick<ResolveMaxSessionBindingDeps, "getIdentityClient"> = {},
): Promise<ResolveMaxNativeUserResult> {
  return nativeUserImpl(provider, providerUserId, deps);
}

export function setResolveMaxNativeUserForTests(
  fn: ResolveMaxNativeUserFn | null,
): void {
  if (fn === null) {
    nativeUserImpl = resolveMaxNativeUserImpl;
    return;
  }

  nativeUserImpl = (provider, providerUserId) => fn(provider, providerUserId);
}

async function resolveMaxSessionBindingImpl(
  request: Request,
  provider: string,
  providerUserId: string,
  deps: ResolveMaxSessionBindingDeps = {},
): Promise<MaxSessionBindingResult> {
  const sessionUserId = await readSessionUserId(request, deps);
  if (!sessionUserId) {
    return noMatch();
  }

  const linked =
    deps.linkedUserId === undefined
      ? await resolveMaxNativeUser(provider, providerUserId, deps)
      : { ok: true as const, userId: deps.linkedUserId };
  if (!linked.ok) {
    return storageUnavailable();
  }
  if (!linked.userId) {
    return noMatch();
  }

  return { ok: true, sessionMatches: linked.userId === sessionUserId };
}

let bindingImpl: (
  request: Request,
  provider: string,
  providerUserId: string,
  deps?: ResolveMaxSessionBindingDeps,
) => Promise<MaxSessionBindingResult> = resolveMaxSessionBindingImpl;

export async function resolveMaxSessionBinding(
  request: Request,
  provider: string,
  providerUserId: string,
  deps: ResolveMaxSessionBindingDeps = {},
): Promise<MaxSessionBindingResult> {
  return bindingImpl(request, provider, providerUserId, deps);
}

export function setResolveMaxSessionBindingForTests(
  fn: ResolveMaxSessionBindingFn | null,
): void {
  if (fn === null) {
    bindingImpl = resolveMaxSessionBindingImpl;
    return;
  }

  bindingImpl = (request, provider, providerUserId) =>
    fn(request, provider, providerUserId);
}
