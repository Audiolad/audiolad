import { NextResponse } from "next/server";

import {
  getStudioProject,
  listStudioAssets,
  softDeleteStudioProject,
  updateStudioProject,
} from "@/lib/studio/server/repository";
import { toStudioAssetDto, toStudioProjectDto } from "@/lib/studio/server/model";
import {
  parseRevision,
  parseStudioProjectData,
  parseUuid,
  sanitizeStudioName,
} from "@/lib/studio/server/validation";
import { studioRouteError } from "@/lib/studio/server/route-errors";

type RouteContext = { params: Promise<{ projectId: string }> };

function handleError(error: unknown) {
  return studioRouteError(error, "studio_project_route_error");
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const projectId = parseUuid((await context.params).projectId, "not_found");
    const project = await getStudioProject(projectId);
    const assets = await listStudioAssets(projectId);
    return NextResponse.json({
      project: toStudioProjectDto(project),
      assets: assets.map(toStudioAssetDto),
    }, {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const body = await request.json();
    const project = await updateStudioProject({
      projectId: parseUuid((await context.params).projectId, "not_found"),
      expectedRevision: parseRevision(body?.expectedRevision),
      name: sanitizeStudioName(body?.name),
      projectData: parseStudioProjectData(body?.projectData),
    });
    return NextResponse.json({ project: toStudioProjectDto(project) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const expectedRevision = parseRevision(
      new URL(request.url).searchParams.get("expectedRevision")
        ? Number(new URL(request.url).searchParams.get("expectedRevision"))
        : null,
    );
    await softDeleteStudioProject({
      projectId: parseUuid((await context.params).projectId, "not_found"),
      expectedRevision,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}
