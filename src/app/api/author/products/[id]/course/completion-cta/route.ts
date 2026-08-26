import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  loadCourseCompletionCta,
  requireCourseBuilderMutationAccess,
  requireCourseBuilderReadAccess,
  upsertCourseCompletionCta,
} from "@/lib/author-products/course-builder";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireCourseBuilderReadAccess(id);
    const completionCta = await loadCourseCompletionCta(supabase, id);

    return NextResponse.json({ completion_cta: completionCta });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireCourseBuilderMutationAccess(id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const completionCta = await upsertCourseCompletionCta(supabase, id, body);

    return NextResponse.json({ completion_cta: completionCta });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
