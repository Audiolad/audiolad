import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  deleteCourseAccessLevel,
  loadPracticeAccessLevels,
  updateCourseAccessLevel,
} from "@/lib/author-products/course-access-levels";
import { parseAccessLevelPatchInput } from "@/lib/author-products/course-access-levels-shared";
import {
  CourseBuilderError,
  loadCourseBuilderSnapshot,
  requireCourseBuilderMutationAccess,
} from "@/lib/author-products/course-builder";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string; level: string }>;
};

function parseLevelParam(raw: string): number {
  const level = Number(raw);
  if (!Number.isInteger(level) || level < 1) {
    throw new CourseBuilderError("invalid_request", 400);
  }

  return level;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, level: rawLevel } = await context.params;
    const { supabase } = await requireCourseBuilderMutationAccess(id);
    const level = parseLevelParam(rawLevel);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const existing = await loadPracticeAccessLevels(service, id);
    const current = existing.find((item) => item.level === level);

    if (!current) {
      throw new CourseBuilderError("access_level_not_found", 404);
    }

    const parsed = parseAccessLevelPatchInput(body, {
      level,
      title: current.title,
      description: current.description,
      upgrade_price: current.upgrade_price,
    });

    if (!parsed.ok) {
      throw new CourseBuilderError(parsed.reason, 400);
    }

    await updateCourseAccessLevel(service, id, level, parsed.value);
    const snapshot = await loadCourseBuilderSnapshot(supabase, id, {
      accessLevelsClient: service,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, level: rawLevel } = await context.params;
    const { supabase } = await requireCourseBuilderMutationAccess(id);
    const level = parseLevelParam(rawLevel);
    const service = createServiceRoleClient();

    await deleteCourseAccessLevel(service, id, level);
    const snapshot = await loadCourseBuilderSnapshot(supabase, id, {
      accessLevelsClient: service,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
