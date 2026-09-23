import "server-only";

import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type MaxSessionBindingResult =
  | { ok: true; sessionMatches: boolean }
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
};

export type ResolveMaxSessionBindingFn = (
  request: Request,
  provider: string,
  providerUserId: string,
) => Promise<MaxSessionBindingResult>;

function noMatch(): MaxSessionBindingResult {
  return { ok: true, sessionMatches: false };
}

function storageUnavailable(): MaxSessionBindingResult {
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

async function readLinkedUserId(
  provider: string,
  providerUserId: string,
  deps: ResolveMaxSessionBindingDeps,
): Promise<{ ok: true; userId: string | null } | { ok: false }> {
  try {
    const client = deps.getIdentityClient
      ? deps.getIdentityClient()
      : (createServiceRoleClient() as unknown as MaxIdentityLookupClient);
    const { data, error } = await client
      .from("external_identities")
      .select("user_id")
      .eq("provider", provider)
      .eq("provider_user_id", providerUserId)
      .maybeSingle();

    if (error) {
      return { ok: false };
    }

    const userId = data?.user_id;
    if (typeof userId !== "string" || userId.length === 0) {
      return { ok: true, userId: null };
    }

    return { ok: true, userId };
  } catch {
    return { ok: false };
  }
}

async function resolveMaxSessionBindingImpl(
  request: Request,
  provider: string,
  providerUserId: string,
  deps: ResolveMaxSessionBindingDeps = {},
): Promise<MaxSessionBindingResult> {
  const trimmedProvider = provider.trim();
  const trimmedProviderUserId = providerUserId.trim();
  if (trimmedProvider.length === 0 || trimmedProviderUserId.length === 0) {
    return storageUnavailable();
  }

  const sessionUserId = await readSessionUserId(request, deps);
  if (!sessionUserId) {
    return noMatch();
  }

  const linked = await readLinkedUserId(
    trimmedProvider,
    trimmedProviderUserId,
    deps,
  );
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
