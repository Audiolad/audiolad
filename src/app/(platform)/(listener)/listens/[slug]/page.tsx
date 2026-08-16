import { notFound } from "next/navigation";
import type { Metadata } from "next";

import ListenPageView from "@/components/listens/ListenPageView";
import {
  buildListenPageMetadata,
  getListenPageBySlug,
  isValidListenPageSlug,
  loadListenPageData,
} from "@/lib/seo/listens";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!isValidListenPageSlug(slug) || !getListenPageBySlug(slug)) {
    return {
      title: "Подборка – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const data = await loadListenPageData(slug);

  if (!data) {
    return {
      title: "Подборка – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  return buildListenPageMetadata(data);
}

export default async function ListenPage({ params }: PageProps) {
  const { slug } = await params;

  if (!isValidListenPageSlug(slug)) {
    notFound();
  }

  const data = await loadListenPageData(slug);

  if (!data) {
    notFound();
  }

  let isAuthenticated = false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  } catch {
    isAuthenticated = false;
  }

  return <ListenPageView data={data} isAuthenticated={isAuthenticated} />;
}
