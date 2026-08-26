import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  deleteCourseLesson,
  requireCourseLessonMutationAccess,
  updateCourseLessonTitle,
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

    const title =
      body && typeof body === "object" && "title" in body && typeof body.title === "string"
        ? body.title
        : null;

    if (title == null) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const lesson = await updateCourseLessonTitle(supabase, id, lessonId, title);

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
