import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  createPersonalMaterialDraft,
  listAuthorPersonalMaterials,
} from "@/lib/personal-materials/server/repository";
import { toSafeAuthorPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
import type { PersonalMaterialRow } from "@/lib/personal-materials/types";
import { handlePersonalMaterialRouteError } from "@/lib/personal-materials/server/errors";
import {
  requireAuthorMaterialListAccess,
  requireAuthorMaterialListReadAccess,
} from "@/lib/personal-materials/server/auth";
import { parseCreatePersonalMaterialBody } from "@/lib/personal-materials/server/validation";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const authorId = url.searchParams.get("author_id")?.trim() ?? "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMaterialListReadAccess(authorId);
    const materials = await listAuthorPersonalMaterials(supabase, authorId);

    return NextResponse.json({
      materials: materials.map((material) => toSafeAuthorPersonalMaterialDto(material)),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreatePersonalMaterialBody(body);
    const { supabase } = await requireAuthorMaterialListAccess(input.authorId);
    const materialId = await createPersonalMaterialDraft(supabase, input);

    const { data: material, error } = await supabase
      .from("personal_materials")
      .select(
        "id, author_id, created_by, material_type, title, client_first_name, client_last_name, material_date, description, personal_recommendation, return_url, return_button_label, audio_path, audio_original_filename, audio_mime_type, audio_size_bytes, duration_seconds, pdf_path, pdf_original_filename, pdf_mime_type, pdf_size_bytes, status, guest_access_enabled, token_created_at, expires_at, claimed_by_user_id, claimed_at, first_opened_at, first_audio_started_at, revoked_at, deleted_at, created_at, updated_at",
      )
      .eq("id", materialId)
      .maybeSingle();

    if (error || !material) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({
      material: toSafeAuthorPersonalMaterialDto(material as PersonalMaterialRow),
    });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
