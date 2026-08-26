import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  reorderCourseLessonBlocks,
  requireCourseLessonMutationAccess,
} from "@/lib/author-products/course-builder";
import { parseReorderItemsPayload } from "@/lib/author-products/reorder-batch";

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

    const items = parseReorderItemsPayload(body, "items");

    if (!items) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const lesson = await reorderCourseLessonBlocks(supabase, id, lessonId, items);

    return NextResponse.json({ lesson });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
