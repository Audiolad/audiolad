import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  appendCourseAccessLevel,
  createInitialCourseAccessLevels,
  loadPracticeAccessLevels,
} from "@/lib/author-products/course-access-levels";
import {
  parseAppendAccessLevelInput,
  parseBootstrapAccessLevelsInput,
} from "@/lib/author-products/course-access-levels-shared";
import {
  CourseBuilderError,
  loadCourseBuilderSnapshot,
  requireCourseBuilderMutationAccess,
  requireCourseBuilderReadAccess,
} from "@/lib/author-products/course-builder";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requireCourseBuilderReadAccess(id);
    const accessLevels = await loadPracticeAccessLevels(
      createServiceRoleClient(),
      id,
    );

    return NextResponse.json({ access_levels: accessLevels });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireCourseBuilderMutationAccess(id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const existing = await loadPracticeAccessLevels(service, id);

    if (existing.length === 0) {
      const parsed = parseBootstrapAccessLevelsInput(body);

      if (!parsed.ok) {
        throw new CourseBuilderError(parsed.reason, 400);
      }

      await createInitialCourseAccessLevels(service, id, parsed.value);
    } else {
      const parsed = parseAppendAccessLevelInput(body);

      if (!parsed.ok) {
        throw new CourseBuilderError(parsed.reason, 400);
      }

      await appendCourseAccessLevel(service, id, parsed.value);
    }

    const snapshot = await loadCourseBuilderSnapshot(supabase, id, {
      accessLevelsClient: service,
    });

    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
