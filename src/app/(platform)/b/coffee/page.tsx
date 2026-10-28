import type { Metadata } from "next";

import GuideIndexView from "@/components/business/vertical-guides/GuideIndexView";
import { buildVerticalIndexMetadata } from "@/lib/business/vertical-guides/metadata";
import { getVertical } from "@/lib/business/vertical-guides/verticals";

export function generateMetadata(): Metadata {
  return buildVerticalIndexMetadata("coffee");
}

export default function CoffeeGuideIndexPage() {
  const vertical = getVertical("coffee");
  if (!vertical) {
    return null;
  }
  return <GuideIndexView vertical={vertical} />;
}
