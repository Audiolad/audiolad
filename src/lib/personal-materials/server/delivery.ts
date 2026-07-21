import { createHash } from "node:crypto";

import { resolveGuestAccessState } from "@/lib/personal-materials/access";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isPathInsidePersonalMaterialRoot,
  PERSONAL_MATERIALS_BUCKET,
} from "@/lib/personal-materials/storage";
import {
  hashAccessToken,
  isValidAccessTokenFormat,
} from "@/lib/personal-materials/tokens";
import {
  PERSONAL_MATERIAL_LIMITS,
  type PersonalMaterialRow,
} from "@/lib/personal-materials/types";

import { PersonalMaterialApiError } from "./errors";

const GUEST_MATERIAL_SELECT =
  "id, author_id, material_type, title, client_first_name, client_last_name, material_date, description, personal_recommendation, return_url, return_button_label, audio_path, pdf_path, status, guest_access_enabled, expires_at, claimed_by_user_id, revoked_at, deleted_at, access_token_hash";

export async function findGuestMaterialByRawToken(
  rawToken: string,
): Promise<PersonalMaterialRow | null> {
  if (!isValidAccessTokenFormat(rawToken)) {
    return null;
  }

  const tokenHash = hashAccessToken(rawToken);
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("personal_materials")
    .select(GUEST_MATERIAL_SELECT)
    .eq("access_token_hash", tokenHashToHexLiteral(tokenHash))
    .maybeSingle();

  if (error) {
    console.error("personal_material_guest_lookup_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return (data as PersonalMaterialRow | null) ?? null;
}

function tokenHashToHexLiteral(tokenHash: Buffer): string {
  return `\\x${tokenHash.toString("hex")}`;
}

export function isGuestMaterialAvailable(material: PersonalMaterialRow): boolean {
  return resolveGuestAccessState(material) === "available";
}

export async function loadGuestAuthor(authorId: string) {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("authors")
    .select("id, name, slug, avatar_url")
    .eq("id", authorId)
    .maybeSingle();

  if (error) {
    console.error("personal_material_guest_author_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return data;
}

export async function createGuestAudioSignedUrl(
  material: PersonalMaterialRow,
): Promise<{ url: string; expiresAt: string }> {
  if (!isGuestMaterialAvailable(material)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  return createPersonalMaterialAudioSignedUrl(material);
}

/** Author preview: signed URL without guest_access requirement. */
export async function createAuthorAudioSignedUrl(
  material: PersonalMaterialRow,
): Promise<{ url: string; expiresAt: string }> {
  if (material.status === "deleted" || material.deleted_at) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  return createPersonalMaterialAudioSignedUrl(material);
}

async function createPersonalMaterialAudioSignedUrl(
  material: PersonalMaterialRow,
): Promise<{ url: string; expiresAt: string }> {
  const audioPath = material.audio_path?.trim();

  if (!audioPath || !isPathInsidePersonalMaterialRoot(audioPath)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const service = createServiceRoleClient();
  const expiresIn = PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { data, error } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .createSignedUrl(audioPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("personal_material_signed_url_error", error?.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return { url, expiresAt };
}

export async function createGuestPdfSignedUrl(
  material: PersonalMaterialRow,
): Promise<{ url: string; expiresAt: string }> {
  if (!isGuestMaterialAvailable(material)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const pdfPath = material.pdf_path?.trim();

  if (!pdfPath || !isPathInsidePersonalMaterialRoot(pdfPath)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const service = createServiceRoleClient();
  const expiresIn = PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { data, error } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .createSignedUrl(pdfPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("personal_material_guest_pdf_signed_url_error", error?.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return { url, expiresAt };
}

export async function createAuthorPdfSignedUrl(
  material: PersonalMaterialRow,
): Promise<{ url: string; expiresAt: string }> {
  const pdfPath = material.pdf_path?.trim();

  if (!pdfPath || !isPathInsidePersonalMaterialRoot(pdfPath)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const service = createServiceRoleClient();
  const expiresIn = PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { data, error } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .createSignedUrl(pdfPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("personal_material_author_pdf_signed_url_error", error?.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return { url, expiresAt };
}

export async function createGuestPdfSignedUrl(
  material: PersonalMaterialRow,
): Promise<{ url: string; expiresAt: string }> {
  if (!isGuestMaterialAvailable(material)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const pdfPath = material.pdf_path?.trim();

  if (!pdfPath || !isPathInsidePersonalMaterialRoot(pdfPath)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const service = createServiceRoleClient();
  const expiresIn = PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { data, error } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .createSignedUrl(pdfPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("personal_material_guest_pdf_signed_url_error", error?.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return { url, expiresAt };
}

export async function createAuthorPdfSignedUrl(
  material: PersonalMaterialRow,
): Promise<{ url: string; expiresAt: string }> {
  const pdfPath = material.pdf_path?.trim();

  if (!pdfPath || !isPathInsidePersonalMaterialRoot(pdfPath)) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const service = createServiceRoleClient();
  const expiresIn = PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { data, error } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .createSignedUrl(pdfPath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("personal_material_author_pdf_signed_url_error", error?.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return { url, expiresAt };
}

export function buildPersonalMaterialAccessUrl(rawToken: string): string {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://audiolad.ru";

  return `${origin}/d/${encodeURIComponent(rawToken)}`;
}

export function redactTokenFromPath(pathname: string): string {
  const match = pathname.match(/^(\/api\/d\/)([^/]+)(\/.*)?$/);

  if (!match) {
    return pathname;
  }

  const prefix = match[1];
  const suffix = match[3] ?? "";
  const token = match[2];
  const digest = createHash("sha256").update(token).digest("hex").slice(0, 12);

  return `${prefix}[redacted:${digest}]${suffix}`;
}
