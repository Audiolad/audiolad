import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  createCourseLessonBlock,
  requireCourseLessonMutationAccess,
} from "@/lib/author-products/course-builder";

type RouteContext = {
  params: Promise<{ id: string; lessonId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id, lessonId } = await context.params;
    const { supabase } = await requireCourseLessonMutationAccess(id, lessonId);
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const type = String(formData.get("type") ?? "");
      const file = formData.get("file");
      const block = await createCourseLessonBlock(supabase, id, lessonId, {
        type,
        file: file instanceof File ? file : undefined,
      });

      return NextResponse.json({ block }, { status: 201 });
    }

    let body: { type?: unknown; payload?: unknown };

    try {
      body = (await request.json()) as { type?: unknown; payload?: unknown };
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (typeof body.type !== "string") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const block = await createCourseLessonBlock(supabase, id, lessonId, {
      type: body.type,
      payload: body.payload,
    });

    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
