import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  getAuthorClientMessageSettings,
  updateAuthorClientMessageSettings,
} from "@/lib/personal-materials/server/client-message-settings";
import { handlePersonalMaterialRouteError } from "@/lib/personal-materials/server/errors";
import { requireAuthorMaterialListAccess } from "@/lib/personal-materials/server/auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const authorId = url.searchParams.get("author_id")?.trim() ?? "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMaterialListAccess(authorId);
    const settings = await getAuthorClientMessageSettings(supabase, authorId);

    return NextResponse.json({ settings });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      authorId?: string;
      clientMessageTemplate?: string | null;
    };

    const authorId = body.authorId?.trim() ?? "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMaterialListAccess(authorId);
    const settings = await updateAuthorClientMessageSettings(
      supabase,
      authorId,
      body.clientMessageTemplate,
    );

    return NextResponse.json({ settings });
  } catch (error) {
    try {
      return handlePersonalMaterialRouteError(error);
    } catch {
      return handleAuthorRouteError(error);
    }
  }
}
