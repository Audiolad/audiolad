import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { requireAuthorMaterialListAccess } from "@/lib/personal-materials/server/auth";
import {
  handlePersonalMaterialRouteError,
  PersonalMaterialApiError,
} from "@/lib/personal-materials/server/errors";
import {
  duplicatePersonalMaterialTemplate,
  getPersonalMaterialTemplateById,
  toSafePersonalMaterialTemplateDto,
} from "@/lib/personal-materials/server/templates";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const template = await getPersonalMaterialTemplateById(supabase, id);

    if (!template) {
      throw new PersonalMaterialApiError("not_found", 404);
    }

    const { user } = await requireAuthorMaterialListAccess(template.author_id);
    const duplicated = await duplicatePersonalMaterialTemplate(
      supabase,
      template,
      user.id,
    );

    return NextResponse.json({
      template: toSafePersonalMaterialTemplateDto(duplicated),
    });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
