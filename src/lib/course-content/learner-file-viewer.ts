import "server-only";

import { isCoursePublication } from "@/lib/course-content/validators";
import { signLearnerPublicationFile } from "@/lib/course-content/learner-file-sign";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { CourseLearnerFileViewerRoute } from "./learner-file-http";

export type CourseLearnerFileViewerLoadResult =
  | { ok: true; filename: string }
  | {
      ok: false;
      reason: "forbidden" | "not_found" | "sign_failed";
      message: string;
    };

const VIEWER_DENIED_MESSAGE = "Нет доступа к этому документу.";
const VIEWER_MISSING_MESSAGE = "Документ не найден.";
const VIEWER_ERROR_MESSAGE = "Не удалось открыть документ. Попробуйте ещё раз.";

/**
 * Authenticated HTML viewer gate. Does not return a storage path or a
 * permanent URL — the page embeds the protected file route.
 */
export async function loadCourseLearnerFileViewer(
  route: CourseLearnerFileViewerRoute,
): Promise<CourseLearnerFileViewerLoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const isMissingSessionError =
    authError?.message?.toLowerCase().includes("auth session missing") ?? false;

  if (authError && !isMissingSessionError) {
    return { ok: false, reason: "sign_failed", message: VIEWER_ERROR_MESSAGE };
  }

  const { practice, error: practiceError } = await getPracticeByAuthorAndSlug(
    supabase,
    route.authorSlug,
    route.productSlug,
  );

  if (practiceError) {
    return { ok: false, reason: "sign_failed", message: VIEWER_ERROR_MESSAGE };
  }

  if (!practice?.id) {
    return { ok: false, reason: "not_found", message: VIEWER_MISSING_MESSAGE };
  }

  if (!isCoursePublication(practice.publication_class, practice.product_kind)) {
    return { ok: false, reason: "not_found", message: VIEWER_MISSING_MESSAGE };
  }

  const signed = await signLearnerPublicationFile({
    supabase,
    serviceRole: createServiceRoleClient(),
    userId: user?.id ?? null,
    practice,
    fileId: route.fileId,
  });

  if (!signed.ok) {
    if (signed.reason === "not_found" || signed.reason === "not_course") {
      return { ok: false, reason: "not_found", message: VIEWER_MISSING_MESSAGE };
    }

    if (signed.reason === "sign_failed") {
      return { ok: false, reason: "sign_failed", message: VIEWER_ERROR_MESSAGE };
    }

    return { ok: false, reason: "forbidden", message: VIEWER_DENIED_MESSAGE };
  }

  return { ok: true, filename: signed.filename };
}
