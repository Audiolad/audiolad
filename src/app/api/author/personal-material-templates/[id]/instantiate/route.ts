import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { requireAuthorMaterialListAccess } from "@/lib/personal-materials/server/auth";
import { toSafeAuthorPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import {
  handlePersonalMaterialRouteError,
  PersonalMaterialApiError,
} from "@/lib/personal-materials/server/errors";
import {
  createPersonalMaterialDraft,
  getAuthorPersonalMaterialById,
} from "@/lib/personal-materials/server/repository";
import { getPersonalMaterialTemplateById } from "@/lib/personal-materials/server/templates";
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

    await requireAuthorMaterialListAccess(template.author_id);

    const today = new Date();
    const materialDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    // Draft requires non-blank first name at DB level; author replaces before activation.
    const materialId = await createPersonalMaterialDraft(supabase, {
      authorId: template.author_id,
      materialType: "diagnostic",
      title: template.title,
      clientFirstName: null,
      clientLastName: null,
      materialDate,
      description: template.description,
      personalRecommendation: template.personal_recommendation,
      returnUrl: template.return_url,
      returnButtonLabel: template.return_button_label,
    });

    const material = await getAuthorPersonalMaterialById(supabase, materialId);

    if (!material) {
      throw new PersonalMaterialApiError("internal_error", 500);
    }

    return NextResponse.json({
      material: toSafeAuthorPersonalMaterialDto(material),
    });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
