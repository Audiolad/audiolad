import "server-only";

import { getPublicRequestOrigin } from "@/lib/seo/app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { resolveStudioActor, toStudioActorView } from "../guest-access";
import {
  buildGuestHandoffUrl,
  evaluateGuestHandoffCreate,
  evaluateGuestHandoffRedeem,
  STUDIO_GUEST_HANDOFF_TTL_MS,
} from "../guest-handoff";
import {
  createGuestToken,
  guestTokenHashesEqual,
  hashGuestToken,
  resolveStudioProjectAccess,
} from "../guest-policy";
import { StudioApiError } from "./validation";

const HANDOFF_SELECT =
  "id, token_hash, guest_session_id, project_id, created_at, expires_at, used_at";

type StudioGuestHandoffRow = {
  id: string;
  token_hash: string;
  guest_session_id: string;
  project_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

async function loadProjectAccessRow(projectId: string): Promise<{
  id: string;
  status: string;
  author_id: string | null;
  guest_session_id: string | null;
} | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_projects")
    .select("id, status, author_id, guest_session_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    console.error("studio_guest_handoff_project_lookup_error", error.message);
    throw new StudioApiError("internal_error", 500);
  }
  if (!data) {
    return null;
  }
  return {
    id: data.id as string,
    status: data.status as string,
    author_id: (data.author_id as string | null) ?? null,
    guest_session_id: (data.guest_session_id as string | null) ?? null,
  };
}

async function insertHandoff(input: {
  tokenHash: string;
  guestSessionId: string;
  projectId: string;
  now: Date;
}): Promise<void> {
  const service = createServiceRoleClient();
  const expiresAt = new Date(
    input.now.getTime() + STUDIO_GUEST_HANDOFF_TTL_MS,
  ).toISOString();
  const { error } = await service.from("studio_guest_handoffs").insert({
    token_hash: input.tokenHash,
    guest_session_id: input.guestSessionId,
    project_id: input.projectId,
    created_at: input.now.toISOString(),
    expires_at: expiresAt,
  });
  if (error) {
    throw error;
  }
}

export async function createStudioGuestHandoffUrl(input: {
  projectId: string;
  request: Request;
}): Promise<string> {
  const actor = await resolveStudioActor();
  const project = await loadProjectAccessRow(input.projectId);
  const access = resolveStudioProjectAccess({
    project,
    actor: toStudioActorView(actor),
  });
  const decision = evaluateGuestHandoffCreate({
    actorKind: actor.kind,
    projectAccessOk: access.ok,
    projectGuestSessionId: project?.guest_session_id ?? null,
    actorSessionId: actor.kind === "guest" ? actor.session.id : null,
  });
  if (!decision.ok) {
    if (actor.kind !== "guest") {
      throw new StudioApiError("unauthenticated", 401);
    }
    throw new StudioApiError("not_found", 404);
  }
  if (!access.ok || access.guestSessionId == null) {
    throw new StudioApiError("not_found", 404);
  }

  const now = new Date();
  let token = createGuestToken();
  try {
    await insertHandoff({
      tokenHash: hashGuestToken(token),
      guestSessionId: access.guestSessionId,
      projectId: input.projectId,
      now,
    });
  } catch (error) {
    if (!isUniqueViolation(error as { code?: string })) {
      console.error("studio_guest_handoff_create_error", error);
      throw new StudioApiError("internal_error", 500);
    }
    token = createGuestToken();
    try {
      await insertHandoff({
        tokenHash: hashGuestToken(token),
        guestSessionId: access.guestSessionId,
        projectId: input.projectId,
        now,
      });
    } catch (retryError) {
      console.error("studio_guest_handoff_create_retry_error", retryError);
      throw new StudioApiError("internal_error", 500);
    }
  }

  return buildGuestHandoffUrl({
    origin: getPublicRequestOrigin(input.request),
    token,
  });
}

async function lookupHandoffByTokenHash(
  tokenHash: string,
): Promise<StudioGuestHandoffRow | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_guest_handoffs")
    .select(HANDOFF_SELECT)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    console.error("studio_guest_handoff_lookup_error", error.message);
    return null;
  }
  if (!data) {
    return null;
  }
  const row = data as StudioGuestHandoffRow;
  if (!guestTokenHashesEqual(row.token_hash, tokenHash)) {
    return null;
  }
  return row;
}

async function sessionStillValid(
  sessionId: string,
  now: Date,
): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_guest_sessions")
    .select("id, expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) {
    return false;
  }
  return new Date(data.expires_at as string).getTime() > now.getTime();
}

async function consumeHandoff(
  id: string,
  now: Date,
): Promise<StudioGuestHandoffRow | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_guest_handoffs")
    .update({ used_at: now.toISOString() })
    .eq("id", id)
    .is("used_at", null)
    .gt("expires_at", now.toISOString())
    .select(HANDOFF_SELECT)
    .maybeSingle();
  if (error) {
    console.error("studio_guest_handoff_consume_error", error.message);
    return null;
  }
  return (data as StudioGuestHandoffRow | null) ?? null;
}

async function rotateGuestSessionToken(sessionId: string): Promise<string> {
  const service = createServiceRoleClient();
  let token = createGuestToken();
  const { error } = await service
    .from("studio_guest_sessions")
    .update({ token_hash: hashGuestToken(token) })
    .eq("id", sessionId);
  if (!error) {
    return token;
  }
  if (!isUniqueViolation(error)) {
    console.error("studio_guest_handoff_rotate_error", error.message);
    throw new StudioApiError("internal_error", 500);
  }
  token = createGuestToken();
  const retry = await service
    .from("studio_guest_sessions")
    .update({ token_hash: hashGuestToken(token) })
    .eq("id", sessionId);
  if (retry.error) {
    console.error("studio_guest_handoff_rotate_retry_error", retry.error.message);
    throw new StudioApiError("internal_error", 500);
  }
  return token;
}

export type RedeemGuestHandoffResult =
  | { ok: true; token: string; projectId: string }
  | { ok: false; error: "invalid" | "used" | "expired" };

export async function redeemStudioGuestHandoff(
  rawToken: string | null,
): Promise<RedeemGuestHandoffResult> {
  if (!rawToken || !rawToken.trim()) {
    return { ok: false, error: "invalid" };
  }

  const now = new Date();
  const tokenHash = hashGuestToken(rawToken);
  const handoff = await lookupHandoffByTokenHash(tokenHash);
  const sessionValid = handoff
    ? await sessionStillValid(handoff.guest_session_id, now)
    : false;
  const decision = evaluateGuestHandoffRedeem({
    now,
    handoff,
    sessionStillValid: sessionValid,
  });
  if (!decision.ok || !handoff) {
    return decision.ok ? { ok: false, error: "invalid" } : decision;
  }

  const consumed = await consumeHandoff(handoff.id, now);
  if (!consumed) {
    return { ok: false, error: "used" };
  }

  try {
    const token = await rotateGuestSessionToken(consumed.guest_session_id);
    return {
      ok: true,
      token,
      projectId: consumed.project_id,
    };
  } catch {
    return { ok: false, error: "expired" };
  }
}
