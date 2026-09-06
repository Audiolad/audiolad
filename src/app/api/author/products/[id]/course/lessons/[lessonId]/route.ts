import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import { resolveLessonRequiredAccessLevelInput } from "@/lib/author-products/course-access-levels";
import {
  deleteCourseLesson,
  requireCourseLessonMutationAccess,
  updateCourseLesson,
} from "@/lib/author-products/course-builder";

type RouteContext = {
  params: Promise<{ id: string; lessonId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, lessonId } = await context.params;
    const { supabase } = await requireCourseLessonMutationAccess(id, lessonId);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const record =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;

    if (!record) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const title = typeof record.title === "string" ? record.title : null;
    const hasLevel =
      "requiredAccessLevel" in record || "required_access_level" in record;

    if (title == null && !hasLevel) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const lesson = await updateCourseLesson(supabase, id, lessonId, {
      title,
      requiredAccessLevel: hasLevel
        ? resolveLessonRequiredAccessLevelInput(record)
        : null,
    });

    return NextResponse.json({ lesson });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, lessonId } = await context.params;
    const { supabase } = await requireCourseLessonMutationAccess(id, lessonId);
    const snapshot = await deleteCourseLesson(supabase, id, lessonId);

    return NextResponse.json(snapshot);
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
