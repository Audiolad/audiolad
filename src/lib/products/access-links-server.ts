import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorAccessError } from "@/lib/author-products/auth";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import {
  generatePracticeAccessToken,
  hashPracticeAccessToken,
} from "@/lib/products/access-links-crypto";
import {
  type AccessLinkExpiryOption,
  type PracticeAccessLinkAllowedTarget,
  type PracticeAccessLinkListItem,
  type PracticeAccessLinkPreview,
  buildAccessLinkUrl,
  buildProductHrefFromPreview,
  isValidPracticeAccessTokenFormat,
  isValidPracticeAccessTokenHash,
  mapAccessLinkListItem,
  parseAccessLinkExpiryOption,
  parseAccessLinkTargetLevel,
  resolveAccessLinkExpiry,
  validateAccessLinkTargetLevel,
} from "@/lib/products/access-links";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const PREVIEW_PRACTICE_ACCESS_LINK_RPC =
  "preview_practice_access_link" as const;
export const REDEEM_PRACTICE_ACCESS_LINK_RPC =
  "redeem_practice_access_link" as const;
export const CREATE_PRACTICE_ACCESS_LINK_RPC =
  "create_practice_access_link" as const;
export const REVOKE_PRACTICE_ACCESS_LINK_RPC =
  "revoke_practice_access_link" as const;

const LIST_SELECT =
  "id, practice_id, target_access_level, status, created_at, expires_at, redeemed_at, revoked_at";

export class AccessLinkError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function mapAccessLinkSqlError(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
}): AccessLinkError {
  const detail = `${error.details ?? ""} ${error.hint ?? ""} ${error.message ?? ""}`;

  const codes = [
    "already_redeemed_by_you",
    "link_already_used",
    "link_expired",
    "link_revoked",
    "invalid_token",
    "target_level_not_configured",
    "access_level_not_available",
    "invalid_access_level",
    "invalid_token_hash",
    "link_not_found",
    "link_not_active",
    "practice_not_found",
    "user_id_required",
  ] as const;

  for (const code of codes) {
    if (detail.includes(code)) {
      return new AccessLinkError(code, statusForAccessLinkCode(code));
    }
  }

  return new AccessLinkError("internal_error", 500);
}

export function statusForAccessLinkCode(code: string): number {
  switch (code) {
    case "already_redeemed_by_you":
      return 200;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "invalid_token":
    case "link_not_found":
    case "practice_not_found":
      return 404;
    case "link_already_used":
    case "link_expired":
    case "link_revoked":
    case "link_not_active":
    case "target_level_not_configured":
    case "access_level_not_available":
      return 409;
    case "invalid_access_level":
    case "invalid_token_hash":
    case "user_id_required":
      return 400;
    default:
      return 500;
  }
}

export async function hashIncomingAccessToken(rawToken: string): Promise<string> {
  if (!isValidPracticeAccessTokenFormat(rawToken)) {
    throw new AccessLinkError("invalid_token", 404);
  }

  return hashPracticeAccessToken(rawToken);
}

export async function loadPracticeForAccessLinks(
  service: SupabaseClient,
  practiceId: string,
): Promise<{
  id: string;
  author_id: string;
  title: string;
  slug: string;
  publication_class: string | null;
  deleted_at: string | null;
}> {
  const { data, error } = await service
    .from("practices")
    .select("id, author_id, title, slug, publication_class, deleted_at")
    .eq("id", practiceId)
    .maybeSingle();

  if (error) {
    throw new AccessLinkError("internal_error", 500);
  }

  if (!data?.id || data.deleted_at) {
    throw new AccessLinkError("practice_not_found", 404);
  }

  return data;
}

export async function loadConfiguredAccessLevels(
  service: SupabaseClient,
  practiceId: string,
): Promise<PracticeAccessLinkAllowedTarget[]> {
  const { data, error } = await service
    .from("practice_access_levels")
    .select("level, title, description")
    .eq("practice_id", practiceId)
    .order("level", { ascending: true });

  if (error) {
    throw new AccessLinkError("internal_error", 500);
  }

  return (data ?? []).map((row) => ({
    level: row.level as number,
    title: (row.title as string | null) ?? null,
    description: (row.description as string | null) ?? null,
  }));
}

export function resolveAllowedAccessLinkTargets(input: {
  publicationClass: string | null;
  configuredLevels: PracticeAccessLinkAllowedTarget[];
}): PracticeAccessLinkAllowedTarget[] {
  if (input.publicationClass !== "course" || input.configuredLevels.length === 0) {
    return [{ level: 1, title: null, description: null }];
  }

  return input.configuredLevels;
}

export async function listPracticeAccessLinks(
  service: SupabaseClient,
  practiceId: string,
): Promise<PracticeAccessLinkListItem[]> {
  const { data, error } = await service
    .from("practice_access_links")
    .select(LIST_SELECT)
    .eq("practice_id", practiceId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AccessLinkError("internal_error", 500);
  }

  return (data ?? []).map((row) =>
    mapAccessLinkListItem({
      id: row.id as string,
      target_access_level: row.target_access_level as number,
      status: row.status as string,
      created_at: row.created_at as string,
      expires_at: (row.expires_at as string | null) ?? null,
      redeemed_at: (row.redeemed_at as string | null) ?? null,
      revoked_at: (row.revoked_at as string | null) ?? null,
    }),
  );
}

export async function createPracticeAccessLink(input: {
  practiceId: string;
  createdByUserId: string;
  createdByAuthorId: string | null;
  targetLevel: unknown;
  expiry: unknown;
}): Promise<{
  accessUrl: string;
  link: PracticeAccessLinkListItem;
}> {
  const service = createServiceRoleClient();
  const practice = await loadPracticeForAccessLinks(service, input.practiceId);
  const configured = await loadConfiguredAccessLevels(service, practice.id);
  const targetLevel = parseAccessLinkTargetLevel(input.targetLevel) ?? 1;
  const validated = validateAccessLinkTargetLevel({
    publicationClass: practice.publication_class,
    configuredLevels: configured,
    targetLevel,
  });

  if (!validated.ok) {
    throw new AccessLinkError(validated.code, statusForAccessLinkCode(validated.code));
  }

  const expiryOption =
    parseAccessLinkExpiryOption(input.expiry) ?? ("none" as AccessLinkExpiryOption);
  const expiresAt = resolveAccessLinkExpiry(expiryOption);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generatePracticeAccessToken();
    const { data, error } = await service.rpc(CREATE_PRACTICE_ACCESS_LINK_RPC, {
      p_practice_id: practice.id,
      p_target_level: validated.targetLevel,
      p_token_hash: token.tokenHash,
      p_created_by_user_id: input.createdByUserId,
      p_created_by_author_id: input.createdByAuthorId,
      p_expires_at: expiresAt?.toISOString() ?? null,
      p_metadata: {
        granted_via: "external_access_link",
      },
    });

    if (error) {
      const mapped = mapAccessLinkSqlError(error);
      if (mapped.code === "invalid_token_hash") {
        continue;
      }
      if (error.message?.includes("practice_access_links_token_hash_unique")) {
        continue;
      }
      throw mapped;
    }

    const row = data as {
      id: string;
      target_access_level: number;
      status: string;
      created_at: string;
      expires_at: string | null;
    };

    return {
      accessUrl: buildAccessLinkUrl(token.rawToken, getAppOrigin()),
      link: mapAccessLinkListItem({
        id: row.id,
        target_access_level: row.target_access_level,
        status: row.status,
        created_at: row.created_at,
        expires_at: row.expires_at,
        redeemed_at: null,
        revoked_at: null,
      }),
    };
  }

  throw new AccessLinkError("internal_error", 500);
}

export async function revokePracticeAccessLink(input: {
  practiceId: string;
  linkId: string;
  revokedByUserId: string;
}): Promise<PracticeAccessLinkListItem> {
  const service = createServiceRoleClient();
  const { data: existing, error: lookupError } = await service
    .from("practice_access_links")
    .select(LIST_SELECT)
    .eq("id", input.linkId)
    .eq("practice_id", input.practiceId)
    .maybeSingle();

  if (lookupError) {
    throw new AccessLinkError("internal_error", 500);
  }

  if (!existing) {
    throw new AccessLinkError("link_not_found", 404);
  }

  const { data, error } = await service.rpc(REVOKE_PRACTICE_ACCESS_LINK_RPC, {
    p_link_id: input.linkId,
    p_revoked_by_user_id: input.revokedByUserId,
  });

  if (error) {
    throw mapAccessLinkSqlError(error);
  }

  const row = data as { id: string; status: string; revoked_at: string | null };

  return mapAccessLinkListItem({
    id: existing.id as string,
    target_access_level: existing.target_access_level as number,
    status: row.status,
    created_at: existing.created_at as string,
    expires_at: (existing.expires_at as string | null) ?? null,
    redeemed_at: (existing.redeemed_at as string | null) ?? null,
    revoked_at: row.revoked_at,
  });
}

export async function previewPracticeAccessLink(input: {
  rawToken: string;
  userId?: string | null;
}): Promise<PracticeAccessLinkPreview> {
  const tokenHash = await hashIncomingAccessToken(input.rawToken);

  if (!isValidPracticeAccessTokenHash(tokenHash)) {
    throw new AccessLinkError("invalid_token", 404);
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.rpc(PREVIEW_PRACTICE_ACCESS_LINK_RPC, {
    p_token_hash: tokenHash,
    p_user_id: input.userId ?? null,
  });

  if (error) {
    throw mapAccessLinkSqlError(error);
  }

  const row = data as {
    status: PracticeAccessLinkPreview["status"];
    product_title: string;
    product_slug: string;
    author_slug: string | null;
    publication_class: string | null;
    target_access_level: number;
    level_title: string | null;
    level_description: string | null;
    expires_at: string | null;
  };

  const preview: PracticeAccessLinkPreview = {
    status: row.status,
    productTitle: row.product_title,
    productSlug: row.product_slug,
    authorSlug: row.author_slug,
    publicationClass: row.publication_class,
    targetAccessLevel: row.target_access_level,
    levelTitle: row.level_title,
    levelDescription: row.level_description,
    expiresAt: row.expires_at,
    productHref: null,
  };

  preview.productHref = buildProductHrefFromPreview(preview);
  return preview;
}

export type RedeemPracticeAccessLinkResult = {
  code: "granted" | "already_redeemed_by_you";
  productHref: string | null;
  accessLevel: number | null;
  raised: boolean;
};

export async function redeemPracticeAccessLink(input: {
  rawToken: string;
  userId: string;
}): Promise<RedeemPracticeAccessLinkResult> {
  const tokenHash = await hashIncomingAccessToken(input.rawToken);
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc(REDEEM_PRACTICE_ACCESS_LINK_RPC, {
    p_token_hash: tokenHash,
    p_user_id: input.userId,
  });

  if (error) {
    const mapped = mapAccessLinkSqlError(error);
    if (mapped.code === "already_redeemed_by_you") {
      const preview = await previewPracticeAccessLink({
        rawToken: input.rawToken,
        userId: input.userId,
      });
      return {
        code: "already_redeemed_by_you",
        productHref: preview.productHref,
        accessLevel: null,
        raised: false,
      };
    }
    throw mapped;
  }

  const row = data as {
    code: string;
    grant?: {
      access_level?: number;
      raised?: boolean;
    };
  };

  const preview = await previewPracticeAccessLink({
    rawToken: input.rawToken,
    userId: input.userId,
  });

  return {
    code: row.code === "granted" ? "granted" : "already_redeemed_by_you",
    productHref: preview.productHref,
    accessLevel: row.grant?.access_level ?? null,
    raised: row.grant?.raised === true,
  };
}

export async function countActiveAccessLinksForLevel(
  service: SupabaseClient,
  practiceId: string,
  level: number,
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { count, error } = await service
    .from("practice_access_links")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId)
    .eq("target_access_level", level)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (error) {
    throw new AccessLinkError("internal_error", 500);
  }

  return count ?? 0;
}

export async function requirePlatformAdminAccessLinkActor() {
  const { requireAuthenticatedUser } = await import("@/lib/author-products/auth");
  const { supabase, user } = await requireAuthenticatedUser();
  const admin = await isPlatformAdmin(supabase, user.id);

  if (!admin) {
    throw new AuthorAccessError("forbidden", 403);
  }

  return { supabase, user };
}
