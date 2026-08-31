import { NextResponse } from "next/server";

import { duplicateStudioProject } from "@/lib/studio/server/repository";
import { toStudioProjectDto } from "@/lib/studio/server/model";
import { parseUuid } from "@/lib/studio/server/validation";
import { studioRouteError } from "@/lib/studio/server/route-errors";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const projectId = parseUuid((await context.params).projectId, "not_found");
    const project = await duplicateStudioProject(projectId);
    return NextResponse.json(
      { project: toStudioProjectDto(project) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return studioRouteError(error, "studio_project_duplicate_route_error");
  }
}
