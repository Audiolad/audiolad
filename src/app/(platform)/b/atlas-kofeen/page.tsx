import type { Metadata } from "next";

import CoffeeAtlasOverview from "@/components/business/coffee-atlas/CoffeeAtlasOverview";
import { buildCoffeeAtlasOverviewMetadata } from "@/lib/business/coffee-atlas/metadata";

export const metadata: Metadata = buildCoffeeAtlasOverviewMetadata();

export default function CoffeeAtlasPage() {
  return <CoffeeAtlasOverview />;
}
