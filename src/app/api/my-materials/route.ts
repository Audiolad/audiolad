import { NextResponse } from "next/server";

import { listMyPersonalMaterials } from "@/lib/personal-materials/client-library/repository";
import {
  handlePersonalMaterialRouteError,
  privateNoStoreHeaders,
} from "@/lib/personal-materials/server/errors";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

    const materials = await listMyPersonalMaterials(supabase);

    return NextResponse.json(
      { materials },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
