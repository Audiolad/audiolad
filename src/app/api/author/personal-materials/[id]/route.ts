import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  assertAuthorEditable,
  requirePersonalMaterialAccess,
  requirePersonalMaterialReadAccess,
} from "@/lib/personal-materials/server/auth";
import { toSafeAuthorPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import {
  handlePersonalMaterialRouteError,
} from "@/lib/personal-materials/server/errors";
import {
  getAuthorNotes,
  getAuthorPersonalMaterialById,
  softDeletePersonalMaterial,
  updatePersonalMaterialDraft,
  updatePersonalMaterialDraftMetadata,
} from "@/lib/personal-materials/server/repository";
import { removePersonalMaterialStorageFiles } from "@/lib/personal-materials/server/uploads";
import type { PersonalMaterialType } from "@/lib/personal-materials/types";
import { parseUpdatePersonalMaterialBody } from "@/lib/personal-materials/server/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePersonalMaterialReadAccess(id);
    const material = await getAuthorPersonalMaterialById(supabase, id);

    if (!material || material.status === "deleted") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const authorNotes = await getAuthorNotes(supabase, id);

    return NextResponse.json({
      material: toSafeAuthorPersonalMaterialDto(material, authorNotes),
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
    const { supabase, material } = await requirePersonalMaterialAccess(id);
    assertAuthorEditable(material);

    const patch = parseUpdatePersonalMaterialBody(await request.json());

    await updatePersonalMaterialDraft(supabase, {
      materialId: id,
      clientFirstName:
        patch.clientFirstName !== undefined
          ? patch.clientFirstName
          : material.client_first_name,
      clientLastName:
        patch.clientLastName !== undefined
          ? patch.clientLastName
          : material.client_last_name,
      materialDate: patch.materialDate ?? material.material_date,
      title: patch.title !== undefined ? patch.title : material.title,
      description:
        patch.description !== undefined ? patch.description : material.description,
      personalRecommendation:
        patch.personalRecommendation !== undefined
          ? patch.personalRecommendation
          : material.personal_recommendation,
      returnUrl: patch.returnUrl !== undefined ? patch.returnUrl : material.return_url,
      returnButtonLabel:
        patch.returnButtonLabel !== undefined
          ? patch.returnButtonLabel
          : material.return_button_label,
    });

    if (patch.materialType && patch.materialType !== material.material_type) {
      const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
      await updatePersonalMaterialDraftMetadata(createServiceRoleClient(), id, {
        material_type: patch.materialType as PersonalMaterialType,
      });
    }

    const updated = await getAuthorPersonalMaterialById(supabase, id);

    if (!updated) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({
      material: toSafeAuthorPersonalMaterialDto(updated),
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
    const { supabase, material } = await requirePersonalMaterialAccess(id);

    await softDeletePersonalMaterial(supabase, id);
    await removePersonalMaterialStorageFiles(material);

    const updated = await getAuthorPersonalMaterialById(supabase, id);

    if (!updated) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({
      material: toSafeAuthorPersonalMaterialDto(updated),
    });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
