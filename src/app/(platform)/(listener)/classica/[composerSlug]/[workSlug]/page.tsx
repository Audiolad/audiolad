import type { Metadata } from "next";
import { notFound } from "next/navigation";

import JsonLd from "@/components/seo/JsonLd";
import ClassicaPublicWorkView from "@/components/classica/ClassicaPublicWorkView";
import { getPublishedClassicaWork } from "@/lib/classica/public/load";
import {
  buildClassicaWorkBreadcrumbs,
  buildClassicaWorkJsonLd,
  buildClassicaWorkMetadata,
} from "@/lib/classica/public/metadata";
import { isClassicaSlug } from "@/lib/classica/production/slug";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ composerSlug: string; workSlug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { composerSlug, workSlug } = await params;
  if (!isClassicaSlug(composerSlug) || !isClassicaSlug(workSlug)) {
    return { title: "Classica — АудиоЛад", robots: { index: false, follow: false } };
  }
  const supabase = await createClient();
  const loaded = await getPublishedClassicaWork(supabase, composerSlug, workSlug);
  if (!loaded) {
    return { title: "Classica — АудиоЛад", robots: { index: false, follow: false } };
  }
  return buildClassicaWorkMetadata(loaded.work);
}

export default async function ClassicaWorkPage({ params }: PageProps) {
  const { composerSlug, workSlug } = await params;
  if (!isClassicaSlug(composerSlug) || !isClassicaSlug(workSlug)) {
    notFound();
  }
  const supabase = await createClient();
  const loaded = await getPublishedClassicaWork(supabase, composerSlug, workSlug);
  if (!loaded) {
    notFound();
  }

  return (
    <>
      <JsonLd data={buildClassicaWorkJsonLd(loaded.work)} />
      <JsonLd data={buildClassicaWorkBreadcrumbs(loaded.work)} />
      <ClassicaPublicWorkView work={loaded.work} related={loaded.related} />
    </>
  );
}
