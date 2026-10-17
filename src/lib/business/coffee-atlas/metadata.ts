import type { Metadata } from "next";

import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

import {
  buildCoffeeAtlasShopPath,
  coffeeAtlasAsset,
  COFFEE_ATLAS_CANONICAL,
  COFFEE_ATLAS_TITLE,
} from "./constants";
import type { CoffeeAtlasShop } from "./shops";

const SITE_NAME = "Аудиолад";

export const COFFEE_ATLAS_META_TITLE = `${COFFEE_ATLAS_TITLE}: 10 кофеен, куда возвращаются – АудиоЛад Бизнес`;

export const COFFEE_ATLAS_META_DESCRIPTION =
  "Путешествие по 10 знаменитым кофейням мира: история, атмосфера, идеи для своей кофейни и то, как каждая из них могла бы звучать. Полный PDF-атлас в подарок.";

function ogImage(file: string, alt: string, width: number, height: number) {
  return [{ url: `${PRODUCTION_APP_ORIGIN}${coffeeAtlasAsset(file)}`, width, height, alt }];
}

export function buildCoffeeAtlasOverviewMetadata(): Metadata {
  return {
    title: COFFEE_ATLAS_META_TITLE,
    description: COFFEE_ATLAS_META_DESCRIPTION,
    alternates: { canonical: COFFEE_ATLAS_CANONICAL },
    robots: { index: true, follow: true },
    openGraph: {
      title: COFFEE_ATLAS_META_TITLE,
      description: COFFEE_ATLAS_META_DESCRIPTION,
      url: COFFEE_ATLAS_CANONICAL,
      type: "website",
      locale: "ru_RU",
      siteName: SITE_NAME,
      images: ogImage("cover.webp", COFFEE_ATLAS_TITLE, 756, 1344),
    },
    twitter: {
      card: "summary_large_image",
      title: COFFEE_ATLAS_META_TITLE,
      description: COFFEE_ATLAS_META_DESCRIPTION,
    },
  };
}

export function buildCoffeeAtlasShopTitle(shop: CoffeeAtlasShop): string {
  return `${shop.name}, ${shop.city}: как могла бы звучать кофейня – ${COFFEE_ATLAS_TITLE}`;
}

export function buildCoffeeAtlasShopDescription(shop: CoffeeAtlasShop): string {
  return `${shop.name} (${shop.city}, ${shop.country}) – ${shop.storyTitle.toLowerCase()}. ${shop.soundIdea}`.slice(
    0,
    300,
  );
}

export function buildCoffeeAtlasShopMetadata(shop: CoffeeAtlasShop): Metadata {
  const url = `${PRODUCTION_APP_ORIGIN}${buildCoffeeAtlasShopPath(shop.slug)}`;
  const title = buildCoffeeAtlasShopTitle(shop);
  const description = buildCoffeeAtlasShopDescription(shop);

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      locale: "ru_RU",
      siteName: SITE_NAME,
      images: ogImage(`${shop.slug}-1.webp`, shop.slideAlts[0], 756, 1344),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
