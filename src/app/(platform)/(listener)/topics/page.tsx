import type { Metadata } from "next";

import TopicsDirectoryPageView from "@/components/topics/TopicsDirectoryPageView";
import {
  buildTopicsDirectoryMetadata,
  loadTopicsDirectoryPageData,
} from "@/lib/seo/topic-hubs";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildTopicsDirectoryMetadata();
}

export default function TopicsDirectoryPage() {
  const data = loadTopicsDirectoryPageData();

  return <TopicsDirectoryPageView data={data} />;
}
