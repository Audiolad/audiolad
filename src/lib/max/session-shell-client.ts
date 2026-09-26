import { SIGNUP_GENERIC_ERROR } from "@/lib/auth/email";
import { readMaxInitData } from "@/lib/max/bridge";
import { readMaxResolvedStartTarget } from "@/lib/max/startapp";
import {
  MAX_SESSION_LINK_PATH,
  MAX_SESSION_VERIFY_PATH,
} from "@/lib/max/host";
import { createMaxSupabaseClient } from "@/lib/max/supabase-client";
import type {
  MaxShellEvent,
  MaxShellSignupError,
} from "@/lib/max/session-shell";

type AuthSession = { access_token: string };

export type MaxAuthClient = {
  auth: {
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{
      data: { session: AuthSession | null };
      error: { message?: string } | null;
    }>;
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
    signOut: () => Promise<unknown>;
  };
};

export type MaxSignUpInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  legalConsent: boolean;
  marketingConsent: boolean;
};

export type MaxSignUpFn = (input: MaxSignUpInput & {
  next: string | null;
}) => Promise<
  | { ok: true; destination: string; hasSession: boolean }
  | { ok: false; error: MaxShellSignupError }
>;

export type MaxShellClientDeps = {
  readInitData: () => string | null;
  getAuthClient: () => MaxAuthClient;
  fetch: typeof fetch;
  signUp?: MaxSignUpFn;
};

function defaultDeps(): MaxShellClientDeps {
  return {
    readInitData: readMaxInitData,
    getAuthClient: () => createMaxSupabaseClient() as unknown as MaxAuthClient,
    fetch: (input, init) => globalThis.fetch(input, init),
  };
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

async function linkMaxSession(
  initData: string,
  accessToken: string,
  deps: Pick<MaxShellClientDeps, "fetch">,
): Promise<MaxShellEvent> {
  try {
    const response = await deps.fetch(MAX_SESSION_LINK_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ initData }),
    });
    return mapLinkResponseToEvent(response.status, await readJsonBody(response));
  } catch {
    return { type: "LINK_SERVER_ERROR" };
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
    const maxAuthenticated =
      linked &&
      (payload as { maxAuthenticated?: unknown }).maxAuthenticated === true;
    const webSessionMatches =
      maxAuthenticated &&
      (payload as { webSessionMatches?: unknown }).webSessionMatches === true;
    const startTarget = readMaxResolvedStartTarget(
      (payload as { startTarget?: unknown }).startTarget,
    );
    return {
      type: "VERIFY_SUCCESS",
      linked,
      maxAuthenticated,
      webSessionMatches,
      ...(startTarget ? { startTarget } : {}),
    };
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

  const { data, error } = await deps.getAuthClient().auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error) {
    return { type: "LOGIN_FAILURE" };
  }

  const accessToken = data.session?.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return { type: "LINK_SERVER_ERROR" };
  }

  hooks.onPasswordAccepted?.();

  return linkMaxSession(initData, accessToken, deps);
}

export async function signUpAndLinkMaxSession(
  input: MaxSignUpInput,
  deps: Partial<MaxShellClientDeps> = {},
  hooks: { onSessionCreated?: () => void } = {},
): Promise<MaxShellEvent> {
  const resolved = { ...defaultDeps(), ...deps };
  const initData = resolved.readInitData();
  if (typeof initData !== "string" || initData.trim().length === 0) {
    return { type: "INIT_DATA_MISSING" };
  }

  if (!resolved.signUp) {
    return {
      type: "SIGNUP_FAILURE",
      error: { field: "form", message: SIGNUP_GENERIC_ERROR },
    };
  }

  let result: Awaited<ReturnType<MaxSignUpFn>>;
  try {
    result = await resolved.signUp({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      password: input.password,
      legalConsent: input.legalConsent,
      marketingConsent: input.marketingConsent,
      next: null,
    });
  } catch {
    return {
      type: "SIGNUP_FAILURE",
      error: { field: "form", message: SIGNUP_GENERIC_ERROR },
    };
  }

  if (!result.ok) {
    return { type: "SIGNUP_FAILURE", error: result.error };
  }

  if (!result.hasSession) {
    return { type: "SIGNUP_PENDING" };
  }

  const { data, error } = await resolved.getAuthClient().auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  const accessToken = data.session?.access_token;
  if (error || typeof accessToken !== "string" || accessToken.length === 0) {
    return { type: "LINK_SERVER_ERROR" };
  }

  hooks.onSessionCreated?.();
  return linkMaxSession(initData, accessToken, resolved);
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
