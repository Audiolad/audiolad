import { notFound } from "next/navigation";
import type { Metadata } from "next";

import TopicHubPageView from "@/components/topics/TopicHubPageView";
import {
  buildTopicHubMetadata,
  getTopicHubBySlug,
  isValidTopicHubSlug,
  listTopicHubSlugs,
  loadTopicHubPageData,
} from "@/lib/seo/topic-hubs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listTopicHubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!isValidTopicHubSlug(slug) || !getTopicHubBySlug(slug)) {
    return {
      title: "Тема – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const supabase = await createClient();
  const data = await loadTopicHubPageData(supabase, slug);

  if (!data) {
    return {
      title: "Тема – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  return buildTopicHubMetadata(data);
}

export default async function TopicHubPage({ params }: PageProps) {
  const { slug } = await params;

  if (!isValidTopicHubSlug(slug)) {
    notFound();
  }

  const supabase = await createClient();
  const data = await loadTopicHubPageData(supabase, slug);

  if (!data) {
    notFound();
  }

  return <TopicHubPageView data={data} />;
}
