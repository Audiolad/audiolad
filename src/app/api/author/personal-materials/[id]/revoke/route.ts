import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { requirePersonalMaterialAccess } from "@/lib/personal-materials/server/auth";
import { toSafeAuthorPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import { handlePersonalMaterialRouteError } from "@/lib/personal-materials/server/errors";
import {
  getAuthorPersonalMaterialById,
  revokePersonalMaterial,
} from "@/lib/personal-materials/server/repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePersonalMaterialAccess(id);

    await revokePersonalMaterial(supabase, id);

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
