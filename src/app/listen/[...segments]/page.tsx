import { notFound, permanentRedirect } from "next/navigation";

import { renderListenPage } from "@/lib/listen/page-shared";
import { resolveLegacyPracticePath } from "@/lib/products/lookup";
import { buildListenPath } from "@/lib/products/paths";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ access?: string }>;
};

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
  const { access } = await searchParams;
  const route = await resolveListenRoute(segments);

  if (!route) {
    notFound();
  }

  return renderListenPage(route.authorSlug, route.productSlug, {
    accessDenied: access === "denied",
  });
}
