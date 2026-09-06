import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  AccessLinkError,
  createPracticeAccessLink,
  listPracticeAccessLinks,
  readAccessLinkCreateRequestBody,
  loadConfiguredAccessLevels,
  loadPracticeForAccessLinks,
  requirePlatformAdminAccessLinkActor,
  resolveAllowedAccessLinkTargets,
} from "@/lib/products/access-links-server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function handleAccessLinkRouteError(error: unknown) {
  if (error instanceof AccessLinkError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }

  return handleAuthorRouteError(error);
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await requirePlatformAdminAccessLinkActor();

    const service = createServiceRoleClient();
    const practice = await loadPracticeForAccessLinks(service, id);
    const [links, configured] = await Promise.all([
      listPracticeAccessLinks(service, id),
      loadConfiguredAccessLevels(service, id),
    ]);

    return NextResponse.json({
      links,
      allowed_targets: resolveAllowedAccessLinkTargets({
        publicationClass: practice.publication_class,
        configuredLevels: configured,
      }),
      publication_class: practice.publication_class,
    });
  } catch (error) {
    return handleAccessLinkRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await requirePlatformAdminAccessLinkActor();
    const service = createServiceRoleClient();
    const practice = await loadPracticeForAccessLinks(service, id);

    const body = await readAccessLinkCreateRequestBody(request);

    const created = await createPracticeAccessLink({
      practiceId: id,
      createdByUserId: user.id,
      createdByAuthorId: practice.author_id,
      body,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleAccessLinkRouteError(error);
  }
}
