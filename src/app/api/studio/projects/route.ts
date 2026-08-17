import { NextResponse } from "next/server";

import { resolveStudioActor } from "@/lib/studio/guest-access";
import {
  createStudioProject,
  listStudioProjects,
  listStudioProjectsForGuest,
} from "@/lib/studio/server/repository";
import {
  toStudioProjectDto,
  toStudioProjectListItemDto,
} from "@/lib/studio/server/model";
import {
  parseUuid,
  sanitizeStudioName,
  StudioApiError,
} from "@/lib/studio/server/validation";
import { studioRouteError } from "@/lib/studio/server/route-errors";

function handleError(error: unknown) {
  return studioRouteError(error, "studio_projects_route_error");
}

export async function GET(request: Request) {
  try {
    const authorIdParam = new URL(request.url).searchParams.get("authorId");
    if (authorIdParam) {
      const authorId = parseUuid(authorIdParam, "invalid_author_id");
      const projects = await listStudioProjects(authorId);
      return NextResponse.json({
        projects: projects.map(toStudioProjectListItemDto),
      });
    }

    const actor = await resolveStudioActor();
    if (actor.kind !== "guest") {
      throw new StudioApiError("unauthenticated", 401);
    }
    const projects = await listStudioProjectsForGuest(actor.session.id);
    return NextResponse.json({
      projects: projects.map(toStudioProjectListItemDto),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "authorId" && key !== "name")
    ) {
      throw new StudioApiError("invalid_request", 422);
    }

    if (body.authorId !== undefined) {
      const project = await createStudioProject({
        authorId: parseUuid(body.authorId, "invalid_author_id"),
        name: sanitizeStudioName(body?.name),
      });
      return NextResponse.json(
        { project: toStudioProjectDto(project) },
        { status: 201 },
      );
    }

    const actor = await resolveStudioActor();
    if (actor.kind !== "guest") {
      throw new StudioApiError("unauthenticated", 401);
    }
    const project = await createStudioProject({
      name: sanitizeStudioName(body?.name),
    });
    return NextResponse.json(
      { project: toStudioProjectDto(project) },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
