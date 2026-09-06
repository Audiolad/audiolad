import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CourseContentAccessInput } from "@/lib/products/access";
import { isCoursePublication } from "@/lib/course-content/validators";

import { canDownloadCoursePublicationFile } from "./learner-assets";
import type { CourseLearnerAccessOptions } from "./learner-access";
import {
  signPublicationFileIfAllowed,
  type PublicationFileSignResult,
} from "./storage";

export type LearnerPublicationFileSignResult =
  | { ok: true; url: string; expiresIn: number; filename: string; sizeBytes: number }
  | { ok: false; reason: "forbidden" | "not_found" | "sign_failed" | "not_course" };

type PublicationFileRow = {
  id: string;
  publication_id: string;
  storage_path: string;
  original_name: string;
  size_bytes: number;
};

/**
 * Sign a course PDF only after: authenticated viewer → parent course →
 * course access → file used as type=file on an accessible lesson.
 * Direct file UUID / storage path cannot bypass the association check.
 */
export async function signLearnerPublicationFile(input: {
  supabase: SupabaseClient;
  serviceRole: SupabaseClient;
  userId: string | null;
  practice: CourseContentAccessInput;
  fileId: string;
  options?: CourseLearnerAccessOptions;
  sign?: (
    bucket: string,
    path: string,
    ttlSeconds: number,
  ) => Promise<{ signedUrl?: string | null } | null>;
}): Promise<LearnerPublicationFileSignResult> {
  if (
    !isCoursePublication(
      input.practice.publication_class,
      input.practice.product_kind,
    )
  ) {
    return { ok: false, reason: "not_course" };
  }

  if (!input.userId) {
    return { ok: false, reason: "forbidden" };
  }

  const allowed = await canDownloadCoursePublicationFile({
    supabase: input.supabase,
    serviceRole: input.serviceRole,
    practice: input.practice,
    userId: input.userId,
    fileId: input.fileId,
    options: input.options,
  });

  if (!allowed) {
    return { ok: false, reason: "forbidden" };
  }

  const { data, error } = await input.serviceRole
    .from("publication_files")
    .select("id, publication_id, storage_path, original_name, size_bytes")
    .eq("id", input.fileId)
    .eq("publication_id", input.practice.id)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "sign_failed" };
  }

  const file = data as PublicationFileRow | null;
  if (!file?.storage_path) {
    return { ok: false, reason: "not_found" };
  }

  const sign =
    input.sign ??
    (async (bucket, path, ttlSeconds) => {
      const result = await input.serviceRole.storage
        .from(bucket)
        .createSignedUrl(path, ttlSeconds);
      return { signedUrl: result.data?.signedUrl };
    });

  const signed = await signPublicationFileIfAllowed({
    allowed: true,
    storagePath: file.storage_path,
    sign,
  });

  if (!signed.ok) {
    return { ok: false, reason: signed.reason };
  }

  return {
    ok: true,
    url: signed.url,
    expiresIn: signed.expiresIn,
    filename: file.original_name,
    sizeBytes: file.size_bytes,
  };
}

export type { PublicationFileSignResult };
