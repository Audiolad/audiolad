import { NextResponse } from "next/server";

import { isCoursePublication } from "@/lib/course-content/validators";
import { signLearnerPublicationFile } from "@/lib/course-content/learner-file-sign";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string; fileId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug: authorSlug, productSlug, fileId } = await context.params;
    const supabase = await createClientFromRequest(request);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    const isMissingSessionError =
      authError?.message?.toLowerCase().includes("auth session missing") ??
      false;

    if (authError && !isMissingSessionError) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const { practice, error: practiceError } = await getPracticeByAuthorAndSlug(
      supabase,
      authorSlug,
      productSlug,
    );

    if (practiceError) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!practice?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (
      !isCoursePublication(practice.publication_class, practice.product_kind)
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const signed = await signLearnerPublicationFile({
      supabase,
      serviceRole: createServiceRoleClient(),
      userId: user?.id ?? null,
      practice,
      fileId,
    });

    if (!signed.ok) {
      const status =
        signed.reason === "not_found"
          ? 404
          : signed.reason === "sign_failed"
            ? 500
            : 403;
      return NextResponse.json({ error: signed.reason }, { status });
    }

    return NextResponse.json({
      url: signed.url,
      expires_in: signed.expiresIn,
      filename: signed.filename,
      size_bytes: signed.sizeBytes,
    });
  } catch (error) {
    console.error("listen_course_file_route_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
