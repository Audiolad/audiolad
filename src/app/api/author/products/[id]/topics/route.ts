import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { loadAuthorProductTopicFormData } from "@/lib/author-products/topic-form-data";
import { setPracticeTopics } from "@/lib/topics/sync";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice } = await requirePracticeAccess(id);
    const topics = await loadAuthorProductTopicFormData(
      supabase,
      practice.author_id,
      id,
    );

    return NextResponse.json({ topics });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user } = await requirePracticeAccess(id);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || !("topic_keys" in body)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const rawKeys = (body as { topic_keys: unknown }).topic_keys;

    if (!Array.isArray(rawKeys) || !rawKeys.every((key) => typeof key === "string")) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const syncResult = await setPracticeTopics(supabase, id, rawKeys);

    if (!syncResult.ok) {
      console.error("author_product_topics_sync_error", {
        practiceId: id,
        authorId: practice.author_id,
        userId: user.id,
        code: syncResult.code,
      });

      return NextResponse.json(
        {
          error: syncResult.code,
          message: syncResult.message,
        },
        { status: syncResult.status },
      );
    }

    const topics = await loadAuthorProductTopicFormData(
      supabase,
      practice.author_id,
      id,
    );

    return NextResponse.json({
      topics,
      result: syncResult.result,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
