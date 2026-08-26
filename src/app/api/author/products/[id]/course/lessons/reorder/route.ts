import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  reorderCourseLessons,
  requireCourseBuilderMutationAccess,
} from "@/lib/author-products/course-builder";
import { parseReorderItemsPayload } from "@/lib/author-products/reorder-batch";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireCourseBuilderMutationAccess(id);

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

    const snapshot = await reorderCourseLessons(supabase, id, items);

    return NextResponse.json(snapshot);
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
