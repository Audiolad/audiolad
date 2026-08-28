export const AUTHOR_SUPPORT_COOKIE_NAME = "audiolad_author_support";
export const AUTHOR_SUPPORT_TTL_SECONDS = 4 * 60 * 60;
export const AUTHOR_SUPPORT_SESSION_ACTIONS = [
  "support_session_started",
  "support_session_ended",
] as const;
export const AUTHOR_SUPPORT_MUTATION_ACTIONS = [
  "product_created",
  "product_updated",
  "product_track_updated",
  "product_cover_updated",
  "product_topics_updated",
  "product_visibility_updated",
  "product_course_updated",
  "product_gallery_updated",
  "product_price_promotion_updated",
  "product_submitted_for_moderation",
  "product_withdrawn_from_moderation",
  "product_published",
  "product_unpublished",
  "product_editing_started",
  "product_soft_deleted",
  "author_profile_updated",
  "studio_project_created",
  "studio_project_updated",
  "studio_project_deleted",
  "studio_asset_uploaded",
  "studio_asset_replaced",
  "studio_asset_deleted",
  "studio_render_queued",
] as const;

export const AUTHOR_SUPPORT_ALLOWED_MUTATION_PREFIXES = [
  "/api/author/products",
  "/api/studio/projects",
  "/api/author/profile",
] as const;

export type AuthorSupportDestination = "cabinet" | "studio";

export type AuthorSupportSessionRecord = {
  id: string;
  actorUserId: string;
  actingUserId: string;
  actingAuthorId: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type AuthorSupportStartInput = {
  actorUserId: string;
  actorIsPlatformOwner: boolean;
  targetUserId: string;
  targetAuthorId: string;
  targetUserExists: boolean;
  membershipRole: "owner" | "editor" | null;
};

export type AuthorSupportStartDenial =
  | "not_platform_owner"
  | "target_not_found"
  | "author_membership_required"
  | "invalid_request";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SENSITIVE_PATH_PREFIXES = [
  "/settings",
  "/profile/edit",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/author-dashboard/finance",
  "/author-dashboard/commercial/payout-details",
  "/api/author/payout-profile",
  "/api/author/finance",
] as const;

const SENSITIVE_METADATA_KEY =
  /password|token|secret|key|cookie|authorization|payload|card|account|inn|phone|bank/i;

export function isAuthorSupportUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function isAuthorSupportSensitivePath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return SENSITIVE_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isAuthorSupportAllowedMutationPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return AUTHOR_SUPPORT_ALLOWED_MUTATION_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isAuthorSupportBlockedMutation(input: {
  pathname: string;
  method?: string;
}): boolean {
  const path = input.pathname.split("?")[0] ?? input.pathname;
  if (isAuthorSupportSensitivePath(path)) {
    return true;
  }

  const method = (input.method ?? "GET").toUpperCase();
  const mutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (!mutating) {
    return false;
  }

  if (isAuthorSupportAllowedMutationPath(path)) {
    return false;
  }

  return path.startsWith("/api/author/") || path.startsWith("/api/studio/");
}

export function evaluateAuthorSupportSqlAuthority(input: {
  authUid: string | null;
  requestTokenHash: string | null;
  session: {
    actorUserId: string;
    tokenHash: string;
    actingAuthorId: string;
    actingUserId: string;
    revokedAt: string | null;
    expiresAt: string;
  } | null;
  resourceAuthorId: string;
  actorIsPlatformOwner: boolean;
  actingUserMembershipRole: "owner" | "editor" | null;
  nowMs?: number;
}): boolean {
  if (!input.authUid || !input.requestTokenHash || !input.session) {
    return false;
  }
  if (input.session.actorUserId !== input.authUid) {
    return false;
  }
  if (input.session.tokenHash !== input.requestTokenHash) {
    return false;
  }
  if (input.session.actingAuthorId !== input.resourceAuthorId) {
    return false;
  }
  if (input.session.revokedAt) {
    return false;
  }
  const nowMs = input.nowMs ?? Date.now();
  if (new Date(input.session.expiresAt).getTime() <= nowMs) {
    return false;
  }
  if (!input.actorIsPlatformOwner) {
    return false;
  }
  if (
    input.actingUserMembershipRole !== "owner" &&
    input.actingUserMembershipRole !== "editor"
  ) {
    return false;
  }
  return true;
}

export function evaluateAuthorMembersCanMutate(input: {
  authUid: string | null;
  isAuthorMember: boolean;
  supportAllows: boolean;
}): boolean {
  if (!input.authUid) {
    return false;
  }
  return input.isAuthorMember === true || input.supportAllows === true;
}

export function evaluateAuthorSupportStart(
  input: AuthorSupportStartInput,
): { ok: true } | { ok: false; code: AuthorSupportStartDenial } {
  if (!isAuthorSupportUuid(input.actorUserId)) {
    return { ok: false, code: "invalid_request" };
  }
  if (!isAuthorSupportUuid(input.targetUserId) || !isAuthorSupportUuid(input.targetAuthorId)) {
    return { ok: false, code: "invalid_request" };
  }
  if (!input.actorIsPlatformOwner) {
    return { ok: false, code: "not_platform_owner" };
  }
  if (!input.targetUserExists) {
    return { ok: false, code: "target_not_found" };
  }
  if (input.membershipRole !== "owner" && input.membershipRole !== "editor") {
    return { ok: false, code: "author_membership_required" };
  }
  return { ok: true };
}

export function isAuthorSupportSessionUsable(input: {
  session: AuthorSupportSessionRecord | null;
  realUserId: string;
  nowMs?: number;
}): boolean {
  const session = input.session;
  if (!session) {
    return false;
  }
  if (session.actorUserId !== input.realUserId) {
    return false;
  }
  if (session.revokedAt) {
    return false;
  }
  const nowMs = input.nowMs ?? Date.now();
  if (new Date(session.expiresAt).getTime() <= nowMs) {
    return false;
  }
  if (!isAuthorSupportUuid(session.actingUserId) || !isAuthorSupportUuid(session.actingAuthorId)) {
    return false;
  }
  return true;
}

export function assertSupportAuthorScope(input: {
  actingAuthorId: string;
  requestedAuthorId: string;
}): boolean {
  return input.actingAuthorId === input.requestedAuthorId;
}

export function resolveSupportBypassCapability(input: {
  authorCanBypass: boolean;
  actorHasModeratePermission: boolean;
  isSupportMode: boolean;
}): boolean {
  if (input.isSupportMode) {
    return input.authorCanBypass === true;
  }
  return input.authorCanBypass === true || input.actorHasModeratePermission === true;
}

export function resolveSupportWorkspaceCapabilities(input: {
  authorCanBypass: boolean;
  actorHasModeratePermission: boolean;
  isSupportMode: boolean;
}): boolean {
  return resolveSupportBypassCapability(input);
}

export function buildAuthorSupportCookieOptions(input?: {
  secure?: boolean;
  maxAge?: number;
}): {
  name: string;
  httpOnly: true;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
} {
  return {
    name: AUTHOR_SUPPORT_COOKIE_NAME,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: input?.secure ?? true,
    maxAge: input?.maxAge ?? AUTHOR_SUPPORT_TTL_SECONDS,
  };
}

export function sanitizeAuthorSupportAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_METADATA_KEY.test(key)) {
      continue;
    }
    if (typeof value === "string" && value.length > 200) {
      next[key] = value.slice(0, 200);
      continue;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      next[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      next[key] = value.slice(0, 40);
    }
  }
  return next;
}

export function resolveAuthorSupportLandingPath(input: {
  destination: AuthorSupportDestination;
  authorSlug: string;
}): string {
  const slug = input.authorSlug.trim();
  if (input.destination === "studio") {
    return "/studio/projects";
  }
  return slug
    ? `/author-dashboard?author=${encodeURIComponent(slug)}`
    : "/author-dashboard";
}

export function resolveAuthorSupportReturnPath(actingUserId: string): string {
  return `/admin/users/${actingUserId}`;
}
