import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { generateAccessToken } from "@/lib/personal-materials/tokens";
import {
  assertDraftEditable,
  requirePersonalMaterialAccess,
} from "@/lib/personal-materials/server/auth";
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
  activatePersonalMaterial,
  getAuthorPersonalMaterialById,
  setPersonalMaterialExpiresAt,
} from "@/lib/personal-materials/server/repository";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseActivateBody } from "@/lib/personal-materials/server/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, material } = await requirePersonalMaterialAccess(id);
    assertDraftEditable(material);

    const hasAudio =
      Boolean(material.audio_path?.trim()) &&
      typeof material.duration_seconds === "number" &&
      material.duration_seconds > 0;
    const hasPdf = Boolean(material.pdf_path?.trim());

    if (!hasAudio && !hasPdf) {
      throw new PersonalMaterialApiError("material_not_ready", 422);
    }

    if (!material.client_first_name?.trim()) {
      throw new PersonalMaterialApiError("client_name_required", 422);
    }

    const { expiresAt } = parseActivateBody(await request.json().catch(() => null));
    const token = generateAccessToken();

    await activatePersonalMaterial(supabase, id, token.tokenHash);

    if (expiresAt) {
      await setPersonalMaterialExpiresAt(createServiceRoleClient(), id, expiresAt);
    }

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
