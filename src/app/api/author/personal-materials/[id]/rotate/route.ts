import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { generateAccessToken } from "@/lib/personal-materials/tokens";
import { requirePersonalMaterialAccess } from "@/lib/personal-materials/server/auth";
import { toSafeAuthorPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import {
  buildPersonalMaterialAccessUrl,
} from "@/lib/personal-materials/server/delivery";
import {
  handlePersonalMaterialRouteError,
  privateNoStoreHeaders,
  PersonalMaterialApiError,
} from "@/lib/personal-materials/server/errors";
import {
  getAuthorPersonalMaterialById,
  rotatePersonalMaterialAccessToken,
} from "@/lib/personal-materials/server/repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, material } = await requirePersonalMaterialAccess(id);

    if (material.status === "deleted") {
      throw new PersonalMaterialApiError("not_found", 404);
    }

    const enableGuestAccess = material.claimed_by_user_id === null;

    if (!enableGuestAccess) {
      throw new PersonalMaterialApiError("conflict", 409);
    }

    const token = generateAccessToken();

    await rotatePersonalMaterialAccessToken(
      supabase,
      id,
      token.tokenHash,
      true,
    );

    const updated = await getAuthorPersonalMaterialById(supabase, id);

    if (!updated) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json(
      {
        material: toSafeAuthorPersonalMaterialDto(updated),
        accessUrl: buildPersonalMaterialAccessUrl(token.rawToken),
      },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
