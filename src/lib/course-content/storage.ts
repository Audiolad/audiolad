import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canAccessCourseContent,
  type CourseContentAccessInput,
} from "@/lib/products/access";

import { PUBLICATION_FILE_LIMITS } from "./validators";

/**
 * Private publication-files bucket. Not personal-materials, not
 * practice-audio, not public. Signed URLs are server-only after
 * canAccessCourseContent. This module does not add a public learner route.
 */
export const PUBLICATION_FILES_BUCKET = "publication-files" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildPublicationFileStoragePath(
  publicationId: string,
  fileId: string,
): string {
  if (!UUID_PATTERN.test(publicationId) || !UUID_PATTERN.test(fileId)) {
    throw new Error("invalid_publication_file_path");
  }

  return `publications/${publicationId}/files/${fileId}.pdf`;
}

export type PublicationFileSignResult =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; reason: "forbidden" | "sign_failed" };

export async function signPublicationFileIfAllowed(input: {
  allowed: boolean;
  storagePath: string;
  sign: (
    bucket: string,
    path: string,
    ttlSeconds: number,
  ) => Promise<{ signedUrl?: string | null } | null>;
  ttlSeconds?: number;
}): Promise<PublicationFileSignResult> {
  if (!input.allowed) {
    return { ok: false, reason: "forbidden" };
  }

  const ttlSeconds =
    input.ttlSeconds ?? PUBLICATION_FILE_LIMITS.signedUrlTtlSeconds;
  const signed = await input.sign(
    PUBLICATION_FILES_BUCKET,
    input.storagePath,
    ttlSeconds,
  );

  const url = signed?.signedUrl?.trim();

  if (!url) {
    return { ok: false, reason: "sign_failed" };
  }

  return { ok: true, url, expiresIn: ttlSeconds };
}

/**
 * Server-only helper. Does not expose a GET /api/learn/* route.
 * Callers must already know this is a course publication.
 */
export async function createPublicationFileSignedUrl(input: {
  supabase: SupabaseClient;
  userId: string | null;
  practice: CourseContentAccessInput;
  storagePath: string;
  sign: (
    bucket: string,
    path: string,
    ttlSeconds: number,
  ) => Promise<{ signedUrl?: string | null } | null>;
}): Promise<PublicationFileSignResult> {
  const allowed = await canAccessCourseContent(
    input.supabase,
    input.practice,
    input.userId,
  );

  return signPublicationFileIfAllowed({
    allowed,
    storagePath: input.storagePath,
    sign: input.sign,
  });
}
