/**
 * Container-aware catalog grid: column count follows ProductGrid width,
 * not viewport breakpoints. Default stays 2 columns so 320px mobile
 * never collapses to a single tile.
 */
export const PRODUCT_GRID_GAP_PX = 12;
export const PRODUCT_GRID_MIN_TILE_PX = 150;
export const PRODUCT_GRID_MIN_COLUMNS = 2;
export const PRODUCT_GRID_MAX_COLUMNS = 6;

export const PRODUCT_GRID_COLUMN_MIN_WIDTHS = {
  3: 474,
  4: 636,
  5: 798,
  6: 960,
} as const;

export const PRODUCT_GRID_CONTAINER_CLASS_NAME =
  "@container min-w-0 w-full";

/** Static class string so Tailwind can see every container-query variant. */
export const PRODUCT_GRID_CLASS_NAME =
  "grid list-none grid-cols-2 gap-3 p-0 @min-[474px]:grid-cols-3 @min-[636px]:grid-cols-4 @min-[798px]:grid-cols-5 @min-[960px]:grid-cols-6";

export function productGridMinWidthForColumns(columns: number): number {
  return columns * PRODUCT_GRID_MIN_TILE_PX + (columns - 1) * PRODUCT_GRID_GAP_PX;
}

export function resolveProductGridColumns(containerWidth: number): number {
  if (containerWidth >= PRODUCT_GRID_COLUMN_MIN_WIDTHS[6]) return 6;
  if (containerWidth >= PRODUCT_GRID_COLUMN_MIN_WIDTHS[5]) return 5;
  if (containerWidth >= PRODUCT_GRID_COLUMN_MIN_WIDTHS[4]) return 4;
  if (containerWidth >= PRODUCT_GRID_COLUMN_MIN_WIDTHS[3]) return 3;
  return PRODUCT_GRID_MIN_COLUMNS;
}
