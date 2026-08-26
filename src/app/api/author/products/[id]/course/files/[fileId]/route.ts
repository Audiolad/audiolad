import { NextResponse } from "next/server";

import { handleCourseBuilderRouteError } from "@/app/api/author/products/[id]/course/route-utils";
import {
  requireCourseBuilderReadAccess,
  signAuthorPublicationFile,
} from "@/lib/author-products/course-builder";

type RouteContext = {
  params: Promise<{ id: string; fileId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, fileId } = await context.params;
    const { supabase } = await requireCourseBuilderReadAccess(id);
    const signed = await signAuthorPublicationFile(supabase, id, fileId);

    return NextResponse.json(signed);
  } catch (error) {
    return handleCourseBuilderRouteError(error);
  }
}
