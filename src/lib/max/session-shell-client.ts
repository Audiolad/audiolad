import { createClient } from "@/lib/supabase/client";
import { readMaxInitData } from "@/lib/max/bridge";
import {
  MAX_SESSION_LINK_PATH,
  MAX_SESSION_VERIFY_PATH,
} from "@/lib/max/host";
import type { MaxShellEvent } from "@/lib/max/session-shell";

type AuthUser = { id: string };

export type MaxAuthClient = {
  auth: {
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{ error: { message?: string } | null }>;
    getUser: () => Promise<{ data: { user: AuthUser | null } }>;
    signOut: () => Promise<unknown>;
  };
};

export type MaxShellClientDeps = {
  readInitData: () => string | null;
  getAuthClient: () => MaxAuthClient;
  fetch: typeof fetch;
};

function defaultDeps(): MaxShellClientDeps {
  return {
    readInitData: readMaxInitData,
    getAuthClient: () => createClient() as unknown as MaxAuthClient,
    fetch: (input, init) => globalThis.fetch(input, init),
  };
}

function hasAuthUser(user: AuthUser | null | undefined): boolean {
  return typeof user?.id === "string" && user.id.length > 0;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function reasonOf(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const reason = (body as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.length > 0 ? reason : null;
}

export function mapLinkResponseToEvent(
  status: number,
  body: unknown,
): MaxShellEvent {
  const reason = reasonOf(body);
  const ok = Boolean(
    body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (body as { ok?: unknown }).ok === true &&
      (body as { linked?: unknown }).linked === true,
  );

  if (status >= 200 && status < 300 && ok) {
    return { type: "LINK_SUCCESS" };
  }
  if (reason === "expired") {
    return { type: "LINK_EXPIRED" };
  }
  if (reason === "identity_already_linked") {
    return { type: "LINK_IDENTITY_CONFLICT" };
  }
  if (reason === "user_already_has_max_identity") {
    return { type: "LINK_USER_CONFLICT" };
  }
  return { type: "LINK_SERVER_ERROR" };
}

async function readSessionUser(deps: MaxShellClientDeps): Promise<boolean> {
  try {
    const { data } = await deps.getAuthClient().auth.getUser();
    return hasAuthUser(data.user);
  } catch {
    return false;
  }
}

export async function verifyMaxSession(
  deps: MaxShellClientDeps = defaultDeps(),
): Promise<MaxShellEvent> {
  const initData = deps.readInitData();
  if (typeof initData !== "string" || initData.trim().length === 0) {
    return { type: "INIT_DATA_MISSING" };
  }

  try {
    const response = await deps.fetch(MAX_SESSION_VERIFY_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const payload = await readJsonBody(response);
    const ok =
      response.ok &&
      Boolean(
        payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          (payload as { ok?: unknown }).ok === true,
      );
    if (!ok) {
      return { type: "VERIFY_FAILURE" };
    }

    const linked = (payload as { linked?: unknown }).linked === true;
    const hasSession = linked ? await readSessionUser(deps) : false;
    return { type: "VERIFY_SUCCESS", linked, hasSession };
  } catch {
    return { type: "VERIFY_FAILURE" };
  }
}

export async function loginAndLinkMaxSession(
  credentials: { email: string; password: string },
  deps: MaxShellClientDeps = defaultDeps(),
  hooks: { onPasswordAccepted?: () => void } = {},
): Promise<MaxShellEvent> {
  const initData = deps.readInitData();
  if (typeof initData !== "string" || initData.trim().length === 0) {
    return { type: "INIT_DATA_MISSING" };
  }

  const { error } = await deps.getAuthClient().auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error) {
    return { type: "LOGIN_FAILURE" };
  }

  hooks.onPasswordAccepted?.();

  try {
    const response = await deps.fetch(MAX_SESSION_LINK_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    return mapLinkResponseToEvent(response.status, await readJsonBody(response));
  } catch {
    return { type: "LINK_SERVER_ERROR" };
  }
}

export async function signOutMaxSession(
  deps: MaxShellClientDeps = defaultDeps(),
): Promise<MaxShellEvent> {
  try {
    await deps.getAuthClient().auth.signOut();
  } catch {
    // Session-only sign-out: still leave the local shell signed out.
  }
  return { type: "SIGN_OUT" };
}
