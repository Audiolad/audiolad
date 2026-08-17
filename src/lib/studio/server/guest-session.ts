import "server-only";

import { cookies } from "next/headers";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  STUDIO_GUEST_COOKIE_NAME,
  STUDIO_GUEST_MAX_PROJECTS,
  buildStudioGuestCookieOptions,
  createGuestToken,
  getStudioGuestTtlDays,
  guestTokenHashesEqual,
  hashGuestToken,
} from "../guest-policy";

export {
  STUDIO_GUEST_COOKIE_NAME,
  STUDIO_GUEST_MAX_PROJECTS,
  createGuestToken,
  getStudioGuestTtlDays,
  hashGuestToken,
};

export type StudioGuestSession = {
  id: string;
  token_hash: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  free_render_consumed_at: string | null;
  free_render_project_id: string | null;
  free_render_job_id: string | null;
};

const SESSION_SELECT =
  "id, token_hash, created_at, last_seen_at, expires_at, free_render_consumed_at, free_render_project_id, free_render_job_id";

function expiresAtFromNow(now = new Date()): string {
  return new Date(
    now.getTime() + getStudioGuestTtlDays() * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function isExpired(session: Pick<StudioGuestSession, "expires_at">, now = new Date()): boolean {
  return new Date(session.expires_at).getTime() <= now.getTime();
}

export async function readGuestCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(STUDIO_GUEST_COOKIE_NAME)?.value;
  return value && value.trim() ? value : null;
}

export async function writeGuestCookie(token: string): Promise<void> {
  const store = await cookies();
  const options = buildStudioGuestCookieOptions();
  store.set(options.name, token, {
    httpOnly: options.httpOnly,
    path: options.path,
    sameSite: options.sameSite,
    secure: options.secure,
    maxAge: options.maxAge,
  });
}

export async function clearGuestCookie(): Promise<void> {
  const store = await cookies();
  store.set(STUDIO_GUEST_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

async function lookupGuestSessionByToken(
  token: string,
): Promise<StudioGuestSession | null> {
  const tokenHash = hashGuestToken(token);
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_guest_sessions")
    .select(SESSION_SELECT)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("studio_guest_session_lookup_error", error.message);
    return null;
  }
  if (!data) {
    return null;
  }

  const session = data as StudioGuestSession;
  if (!guestTokenHashesEqual(session.token_hash, tokenHash)) {
    return null;
  }
  if (isExpired(session)) {
    return null;
  }
  return session;
}

export async function getGuestSession(): Promise<StudioGuestSession | null> {
  const token = await readGuestCookie();
  if (!token) {
    return null;
  }
  return lookupGuestSessionByToken(token);
}

export async function touchGuestSession(id: string): Promise<void> {
  const service = createServiceRoleClient();
  const now = new Date();
  const { error } = await service
    .from("studio_guest_sessions")
    .update({
      last_seen_at: now.toISOString(),
      expires_at: expiresAtFromNow(now),
    })
    .eq("id", id)
    .gt("expires_at", now.toISOString());

  if (error) {
    console.error("studio_guest_session_touch_error", error.message);
  }
}

export async function ensureGuestSession(): Promise<StudioGuestSession> {
  const existingToken = await readGuestCookie();
  if (existingToken) {
    const existing = await lookupGuestSessionByToken(existingToken);
    if (existing) {
      await touchGuestSession(existing.id);
      await writeGuestCookie(existingToken);
      return {
        ...existing,
        last_seen_at: new Date().toISOString(),
        expires_at: expiresAtFromNow(),
      };
    }
  }

  const token = createGuestToken();
  const tokenHash = hashGuestToken(token);
  const now = new Date();
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_guest_sessions")
    .insert({
      token_hash: tokenHash,
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      expires_at: expiresAtFromNow(now),
    })
    .select(SESSION_SELECT)
    .single();

  if (error || !data) {
    console.error("studio_guest_session_create_error", error?.message);
    throw new Error("studio_guest_session_create_failed");
  }

  await writeGuestCookie(token);
  return data as StudioGuestSession;
}
