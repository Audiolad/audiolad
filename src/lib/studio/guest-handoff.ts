export const STUDIO_GUEST_HANDOFF_TTL_MS = 8 * 60 * 1000;
export const STUDIO_GUEST_HANDOFF_PATH = "/studio/try/handoff";
export const STUDIO_GUEST_HANDOFF_RESULT_PATH = "/studio/try/handoff/result";

export const STUDIO_GUEST_HANDOFF_EXPIRED_MESSAGE =
  "Ссылка для перехода устарела. Вернитесь в Студию и скопируйте новую ссылку.";
export const STUDIO_GUEST_HANDOFF_USED_MESSAGE =
  "Эта ссылка уже была использована. При необходимости скопируйте новую ссылку из Студии.";
export const STUDIO_GUEST_HANDOFF_INVALID_MESSAGE =
  "Ссылка для перехода недействительна или устарела. Вернитесь в Студию и скопируйте новую ссылку.";
export const STUDIO_GUEST_HANDOFF_CREATE_FAILED_MESSAGE =
  "Не удалось подготовить ссылку. Попробуйте ещё раз.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GuestHandoffCreateDecision =
  | { ok: true }
  | { ok: false; error: "forbidden" | "not_found" };

export function evaluateGuestHandoffCreate(input: {
  actorKind: "author" | "guest" | "none";
  projectAccessOk: boolean;
  projectGuestSessionId: string | null;
  actorSessionId: string | null;
}): GuestHandoffCreateDecision {
  if (input.actorKind === "author") {
    return { ok: false, error: "forbidden" };
  }
  if (input.actorKind !== "guest") {
    return { ok: false, error: "not_found" };
  }
  if (
    !input.projectAccessOk ||
    input.actorSessionId == null ||
    input.projectGuestSessionId == null ||
    input.projectGuestSessionId !== input.actorSessionId
  ) {
    return { ok: false, error: "not_found" };
  }
  return { ok: true };
}

export type GuestHandoffRow = {
  expires_at: string;
  used_at: string | null;
  guest_session_id: string;
  project_id: string;
};

export type GuestHandoffRedeemDecision =
  | { ok: true; sessionId: string; projectId: string }
  | { ok: false; error: "invalid" | "used" | "expired" };

export function evaluateGuestHandoffRedeem(input: {
  now: Date;
  handoff: GuestHandoffRow | null;
  sessionStillValid: boolean;
}): GuestHandoffRedeemDecision {
  if (!input.handoff) {
    return { ok: false, error: "invalid" };
  }
  if (input.handoff.used_at != null) {
    return { ok: false, error: "used" };
  }
  if (new Date(input.handoff.expires_at).getTime() <= input.now.getTime()) {
    return { ok: false, error: "expired" };
  }
  if (!input.sessionStillValid) {
    return { ok: false, error: "expired" };
  }
  return {
    ok: true,
    sessionId: input.handoff.guest_session_id,
    projectId: input.handoff.project_id,
  };
}

export function buildGuestHandoffUrl(input: {
  origin: string;
  token: string;
}): string {
  const origin = input.origin.replace(/\/$/, "");
  const url = new URL(STUDIO_GUEST_HANDOFF_PATH, `${origin}/`);
  url.searchParams.set("t", input.token);
  return url.toString();
}

export function buildGuestHandoffSafeReturnPath(projectId: string): string {
  if (typeof projectId === "string" && UUID_PATTERN.test(projectId)) {
    return `/studio/project/${projectId}`;
  }
  return "/studio/projects";
}

export function buildGuestHandoffResultPath(
  reason: "expired" | "used" | "invalid",
): string {
  return `${STUDIO_GUEST_HANDOFF_RESULT_PATH}?reason=${reason}`;
}

export function guestHandoffResultMessage(
  reason: string | undefined,
): string {
  if (reason === "used") {
    return STUDIO_GUEST_HANDOFF_USED_MESSAGE;
  }
  if (reason === "expired") {
    return STUDIO_GUEST_HANDOFF_EXPIRED_MESSAGE;
  }
  return STUDIO_GUEST_HANDOFF_INVALID_MESSAGE;
}
