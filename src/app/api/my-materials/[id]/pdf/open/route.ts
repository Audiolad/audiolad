import { NextResponse } from "next/server";

import { createOwnerPdfSignedUrl } from "@/lib/personal-materials/client-library/pdf";
import { getMyPersonalMaterial } from "@/lib/personal-materials/client-library/repository";
import { redirectToSignedPdfUrl } from "@/lib/personal-materials/server/delivery";
import {
  handlePersonalMaterialRouteError,
  privateNoStoreHeaders,
} from "@/lib/personal-materials/server/errors";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: privateNoStoreHeaders() },
      );
    }

    const { id } = await context.params;

    await getMyPersonalMaterial(supabase, id);

    const signed = await createOwnerPdfSignedUrl({
      materialId: id,
      userId: user.id,
    });

    return redirectToSignedPdfUrl(signed.url, privateNoStoreHeaders());
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
