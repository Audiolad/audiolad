import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  deleteCourseLessonBlock,
  requireCourseBlockMutationAccess,
  updateCourseLessonBlock,
} from "@/lib/author-products/course-builder";

type RouteContext = {
  params: Promise<{ id: string; lessonId: string; blockId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, lessonId, blockId } = await context.params;
    const { supabase } = await requireCourseBlockMutationAccess(
      id,
      lessonId,
      blockId,
    );
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const block = await updateCourseLessonBlock(supabase, id, lessonId, blockId, {
        file: file instanceof File ? file : undefined,
        title:
          typeof formData.get("title") === "string"
            ? String(formData.get("title"))
            : undefined,
      });

      return NextResponse.json({ block });
    }

    let body: { payload?: unknown; title?: unknown };

    try {
      body = (await request.json()) as { payload?: unknown; title?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const block = await updateCourseLessonBlock(supabase, id, lessonId, blockId, {
      payload: body.payload,
      title: typeof body.title === "string" ? body.title : undefined,
    });

    return NextResponse.json({ block });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, lessonId, blockId } = await context.params;
    const { supabase } = await requireCourseBlockMutationAccess(
      id,
      lessonId,
      blockId,
    );
    const snapshot = await deleteCourseLessonBlock(
      supabase,
      id,
      lessonId,
      blockId,
    );

    return NextResponse.json(snapshot);
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
