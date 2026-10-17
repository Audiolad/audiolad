import { buildCoffeeAtlasShopPath, COFFEE_ATLAS_PATH } from "./constants";
import { COFFEE_ATLAS_SHOPS } from "./shops";

/** Overview + 10 shop pages (all public, indexable). */
export const COFFEE_ATLAS_SITEMAP_PATHS: readonly string[] = [
  COFFEE_ATLAS_PATH,
  ...COFFEE_ATLAS_SHOPS.map((shop) => buildCoffeeAtlasShopPath(shop.slug)),
];
