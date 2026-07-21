import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { requireAuthorMaterialListAccess } from "@/lib/personal-materials/server/auth";
import {
  handlePersonalMaterialRouteError,
  PersonalMaterialApiError,
} from "@/lib/personal-materials/server/errors";
import {
  deletePersonalMaterialTemplate,
  getPersonalMaterialTemplateById,
  parseTemplateBody,
  toSafePersonalMaterialTemplateDto,
  updatePersonalMaterialTemplate,
} from "@/lib/personal-materials/server/templates";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const template = await getPersonalMaterialTemplateById(supabase, id);

    if (!template) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    await requireAuthorMaterialListAccess(template.author_id);

    return NextResponse.json({
      template: toSafePersonalMaterialTemplateDto(template),
    });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const existing = await getPersonalMaterialTemplateById(supabase, id);

    if (!existing) {
      throw new PersonalMaterialApiError("not_found", 404);
    }

    await requireAuthorMaterialListAccess(existing.author_id);
    const fields = parseTemplateBody(await request.json());
    const updated = await updatePersonalMaterialTemplate(supabase, id, fields);

    return NextResponse.json({
      template: toSafePersonalMaterialTemplateDto(updated),
    });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const existing = await getPersonalMaterialTemplateById(supabase, id);

    if (!existing) {
      throw new PersonalMaterialApiError("not_found", 404);
    }

    await requireAuthorMaterialListAccess(existing.author_id);
    await deletePersonalMaterialTemplate(supabase, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
