import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  assertDraftEditable,
  requirePersonalMaterialAccess,
  requirePersonalMaterialReadAccess,
} from "@/lib/personal-materials/server/auth";
import { createAuthorPdfSignedUrl } from "@/lib/personal-materials/server/delivery";
import { toSafeAuthorPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import {
  handlePersonalMaterialRouteError,
  privateNoStoreHeaders,
} from "@/lib/personal-materials/server/errors";
import { getAuthorPersonalMaterialById } from "@/lib/personal-materials/server/repository";
import {
  deletePersonalMaterialPdf,
  uploadPersonalMaterialPdf,
} from "@/lib/personal-materials/server/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { material } = await requirePersonalMaterialReadAccess(id);

    const signed = await createAuthorPdfSignedUrl(material);

    return NextResponse.json(signed, { headers: privateNoStoreHeaders() });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, material } = await requirePersonalMaterialAccess(id);
    assertDraftEditable(material);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    await uploadPersonalMaterialPdf(material, file);

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
    assertDraftEditable(material);

    await deletePersonalMaterialPdf(supabase, material);

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
