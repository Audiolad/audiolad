import { NextResponse } from "next/server";

import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isPathInsidePersonalMaterialRoot,
  PERSONAL_MATERIALS_BUCKET,
} from "@/lib/personal-materials/storage";
import {
  PERSONAL_MATERIAL_LIMITS,
  type PersonalMaterialRow,
} from "@/lib/personal-materials/types";

import { PersonalMaterialApiError } from "./errors";

export type PersonalMaterialAttachmentKind = "audio" | "pdf";

export function resolvePersonalMaterialDownloadFilename(
  material: Pick<
    PersonalMaterialRow,
    "audio_original_filename" | "pdf_original_filename"
  >,
  kind: PersonalMaterialAttachmentKind,
): string {
  if (kind === "audio") {
    const name = material.audio_original_filename?.trim();
    return name || "audio.mp3";
  }

  const name = material.pdf_original_filename?.trim();
  return name || "document.pdf";
}

function getTrustedAttachmentPath(
  material: PersonalMaterialRow,
  kind: PersonalMaterialAttachmentKind,
): string | null {
  const storagePath =
    kind === "audio" ? material.audio_path?.trim() : material.pdf_path?.trim();

  if (!storagePath || !isPathInsidePersonalMaterialRoot(storagePath)) {
    return null;
  }

  return storagePath;
}

export async function createAuthorAttachmentDownloadSignedUrl(
  material: PersonalMaterialRow,
  kind: PersonalMaterialAttachmentKind,
): Promise<{ url: string; expiresAt: string; filename: string }> {
  if (material.status === "deleted" || material.deleted_at) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const storagePath = getTrustedAttachmentPath(material, kind);

  if (!storagePath) {
    throw new PersonalMaterialApiError("not_found", 404);
  }

  const filename = resolvePersonalMaterialDownloadFilename(material, kind);
  const service = createServiceRoleClient();
  const expiresIn = PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { data, error } = await service.storage
    .from(PERSONAL_MATERIALS_BUCKET)
    .createSignedUrl(storagePath, expiresIn, { download: filename });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";

    if (message.includes("not found") || message.includes("object not found")) {
      throw new PersonalMaterialApiError("not_found", 404);
    }

    console.error("personal_material_download_signed_url_error", error.message);
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  if (!data?.signedUrl) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new PersonalMaterialApiError("internal_error", 500);
  }

  return { url, expiresAt, filename };
}

export function redirectToAttachmentDownload(
  signedUrl: string,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.redirect(signedUrl, {
    status: 307,
    headers,
  });
}
