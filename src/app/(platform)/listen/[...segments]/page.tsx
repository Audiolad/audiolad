import { notFound, permanentRedirect } from "next/navigation";

import { renderListenPage } from "@/lib/listen/page-shared";
import { parseListenAutoplayIntent } from "@/lib/listen/autoplay-intent";
import { resolveLegacyPracticePath } from "@/lib/products/lookup";
import { buildListenPath } from "@/lib/products/paths";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};


async function resolveAuthorSlugListenRedirect(
  authorSlug: string,
  productSlug: string,
) {
  const supabase = await createClient();
  const {
    resolveAuthorSlugRedirect,
    buildListenRedirectTarget,
    practiceBelongsToAuthor,
  } = await import("@/lib/authors/space-ops");
  const redirected = await resolveAuthorSlugRedirect(supabase, authorSlug);
  if (!redirected) {
    return null;
  }
  const belongs = await practiceBelongsToAuthor(
    supabase,
    redirected.authorId,
    productSlug,
  );
  if (!belongs) {
    return null;
  }
  return buildListenRedirectTarget(redirected.currentSlug, productSlug);
}

async function resolveListenRoute(segments: string[]) {
  if (segments.length === 2) {
    return {
      authorSlug: segments[0],
      productSlug: segments[1],
    };
  }

  if (segments.length === 1) {
    const supabase = await createClient();
    const resolved = await resolveLegacyPracticePath(supabase, segments[0]);

    if (!resolved) {
      return null;
    }

    permanentRedirect(
      buildListenPath(resolved.authorSlug, resolved.productSlug),
    );
  }

  return null;
}

export default async function ListenPage({ params, searchParams }: PageProps) {
  const { segments } = await params;
  const query = await searchParams;
  const route = await resolveListenRoute(segments);

  if (!route) {
    notFound();
  }

  if (segments.length === 2) {
    const supabase = await createClient();
    const { getPracticeByAuthorAndSlug } = await import("@/lib/products/lookup");
    const { practice, error } = await getPracticeByAuthorAndSlug(
      supabase,
      route.authorSlug,
      route.productSlug,
    );
    if (!error && !practice) {
      const redirectTo = await resolveAuthorSlugListenRedirect(
        route.authorSlug,
        route.productSlug,
      );
      if (redirectTo) {
        permanentRedirect(redirectTo);
      }
    }
  }

  const access = typeof query.access === "string" ? query.access : undefined;
  const autoplay =
    typeof query.autoplay === "string" ? query.autoplay : undefined;

  return renderListenPage(route.authorSlug, route.productSlug, {
    accessDenied: access === "denied",
    autoplay: parseListenAutoplayIntent(autoplay),
    searchParams: query,
  });
}
