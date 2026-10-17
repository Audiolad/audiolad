import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CoffeeAtlasShopView from "@/components/business/coffee-atlas/CoffeeAtlasShopView";
import { loadCoffeeAtlasMusic } from "@/lib/business/coffee-atlas/load-music";
import { buildCoffeeAtlasShopMetadata } from "@/lib/business/coffee-atlas/metadata";
import { getCoffeeAtlasNeighbours, getCoffeeAtlasShop } from "@/lib/business/coffee-atlas/shops";

// Music examples come from the live published catalogue (same as /b).
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const shop = getCoffeeAtlasShop(slug);
  return shop ? buildCoffeeAtlasShopMetadata(shop) : {};
}

export default async function CoffeeAtlasShopPage({ params }: PageProps) {
  const { slug } = await params;
  const shop = getCoffeeAtlasShop(slug);
  const neighbours = getCoffeeAtlasNeighbours(slug);

  if (!shop || !neighbours) {
    notFound();
  }

  const music = await loadCoffeeAtlasMusic();

  return (
    <CoffeeAtlasShopView
      shop={shop}
      previous={neighbours.previous}
      next={neighbours.next}
      tracks={music[shop.slug] ?? []}
    />
  );
}
