import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { requireAuthorMaterialListAccess } from "@/lib/personal-materials/server/auth";
import { handlePersonalMaterialRouteError } from "@/lib/personal-materials/server/errors";
import {
  createPersonalMaterialTemplate,
  listPersonalMaterialTemplates,
  parseTemplateBody,
  toSafePersonalMaterialTemplateDto,
} from "@/lib/personal-materials/server/templates";

export async function GET(request: Request) {
  try {
    const authorId = new URL(request.url).searchParams.get("author_id")?.trim() ?? "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMaterialListAccess(authorId);
    const templates = await listPersonalMaterialTemplates(supabase, authorId);

    return NextResponse.json({
      templates: templates.map(toSafePersonalMaterialTemplateDto),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authorId = typeof body.authorId === "string" ? body.authorId.trim() : "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, user } = await requireAuthorMaterialListAccess(authorId);
    const fields = parseTemplateBody(body);
    const created = await createPersonalMaterialTemplate(supabase, {
      authorId,
      userId: user.id,
      ...fields,
    });

    return NextResponse.json({
      template: toSafePersonalMaterialTemplateDto(created),
    });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
