import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  isCourseBuilderError,
} from "@/lib/author-products/course-builder";
import { getCourseBuilderErrorMessage } from "@/lib/author-products/course-builder-shared";

export function handleCourseBuilderRouteError(error: unknown) {
  if (isCourseBuilderError(error)) {
    return NextResponse.json(
      {
        error: error.code,
        message: getCourseBuilderErrorMessage(error.code),
      },
      { status: error.status },
    );
  }

  return handleAuthorRouteError(error);
}
