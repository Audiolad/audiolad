import { NextResponse } from "next/server";

import {
  getMyPersonalMaterial,
  getMyPersonalMaterialProgress,
  saveMyPersonalMaterialProgress,
} from "@/lib/personal-materials/client-library/repository";
import {
  handlePersonalMaterialRouteError,
  PersonalMaterialApiError,
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
    const material = await getMyPersonalMaterial(supabase, id);
    const progress = await getMyPersonalMaterialProgress(
      supabase,
      id,
      material.progress.durationSeconds,
    );

    return NextResponse.json(
      { progress },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
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
    const material = await getMyPersonalMaterial(supabase, id);
    const body = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as { positionSeconds?: unknown }).positionSeconds !== "number"
    ) {
      throw new PersonalMaterialApiError("invalid_request", 400);
    }

    const record = body as {
      positionSeconds: number;
      durationSeconds?: number;
      completed?: boolean;
    };

    const progress = await saveMyPersonalMaterialProgress(supabase, id, {
      positionSeconds: record.positionSeconds,
      durationSeconds:
        typeof record.durationSeconds === "number"
          ? record.durationSeconds
          : material.progress.durationSeconds ?? undefined,
      completed: record.completed,
    });

    return NextResponse.json(
      { progress },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
