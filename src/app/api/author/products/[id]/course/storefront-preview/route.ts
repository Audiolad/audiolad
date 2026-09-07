import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import { requirePracticeMutationAccess } from "@/lib/author-products/auth";
import {
  loadCourseBuilderSnapshot,
  requireCourseBuilderReadAccess,
  saveCourseStorefrontPreview,
} from "@/lib/author-products/course-builder";
import { CourseBuilderError } from "@/lib/author-products/course-builder-shared";
import { resolveCourseStorefrontPreviewDto } from "@/lib/author-products/course-storefront-preview";
import { isCoursePublication } from "@/lib/author-products/publication-class";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function assertCourseProduct(practice: {
  publication_class?: string | null;
  product_kind?: string | null;
}) {
  if (!isCoursePublication(practice.publication_class, practice.product_kind)) {
    throw new CourseBuilderError("course_content_parent_must_be_course", 403);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireCourseBuilderReadAccess(id);
    const snapshot = await loadCourseBuilderSnapshot(supabase, id);

    return NextResponse.json({
      storefront_preview: resolveCourseStorefrontPreviewDto(snapshot.lessons),
    });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeMutationAccess(id);
    assertCourseProduct(practice);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const snapshot = await saveCourseStorefrontPreview(supabase, id, body);

    return NextResponse.json({
      ...snapshot,
      storefront_preview: resolveCourseStorefrontPreviewDto(snapshot.lessons),
    });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
