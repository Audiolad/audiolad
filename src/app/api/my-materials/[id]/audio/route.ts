import { NextResponse } from "next/server";

import { createOwnerAudioSignedUrl } from "@/lib/personal-materials/client-library/audio";
import { getMyPersonalMaterial } from "@/lib/personal-materials/client-library/repository";
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

    // Ownership gate via claimed RPC (neutral not_found for strangers).
    await getMyPersonalMaterial(supabase, id);

    const signed = await createOwnerAudioSignedUrl({
      materialId: id,
      userId: user.id,
    });

    return NextResponse.json(signed, { headers: privateNoStoreHeaders() });
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
