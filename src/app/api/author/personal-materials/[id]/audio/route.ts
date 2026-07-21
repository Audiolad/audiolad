import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  assertAuthorEditable,
  requirePersonalMaterialAccess,
} from "@/lib/personal-materials/server/auth";
import { toSafeAuthorPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import { handlePersonalMaterialRouteError } from "@/lib/personal-materials/server/errors";
import { getAuthorPersonalMaterialById } from "@/lib/personal-materials/server/repository";
import {
  deletePersonalMaterialAudio,
  uploadPersonalMaterialAudio,
} from "@/lib/personal-materials/server/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, material } = await requirePersonalMaterialAccess(id);
    assertAuthorEditable(material);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    await uploadPersonalMaterialAudio(material, file);

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
    assertAuthorEditable(material);

    await deletePersonalMaterialAudio(supabase, material);

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
