import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
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

    try {
      const body = (await request.json()) as { title?: unknown };
      if (typeof body?.title === "string") {
        title = body.title;
      }
    } catch {
      title = null;
    }

    const lesson = await createCourseLesson(supabase, id, title);

    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
