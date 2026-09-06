import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import { resolveLessonRequiredAccessLevelInput } from "@/lib/author-products/course-access-levels";
import {
  createCourseLesson,
  loadCourseBuilderSnapshot,
  requireCourseBuilderMutationAccess,
  requireCourseBuilderReadAccess,
} from "@/lib/author-products/course-builder";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireCourseBuilderReadAccess(id);
    const snapshot = await loadCourseBuilderSnapshot(supabase, id);

    return NextResponse.json(snapshot);
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireCourseBuilderMutationAccess(id);

    let title: string | null = null;
    let body: unknown = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    if (body && typeof body === "object" && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      if (typeof record.title === "string") {
        title = record.title;
      }
    }

    const requiredAccessLevel = resolveLessonRequiredAccessLevelInput(body, 1);

    const lesson = await createCourseLesson(
      supabase,
      id,
      title,
      requiredAccessLevel,
    );

    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
