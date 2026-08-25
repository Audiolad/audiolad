/**
 * Stage 3+ homes for the playlist catalog UI.
 * Do not create these files in Stage 2. Listing data lives in listing.ts.
 */
export const PLAYLIST_CATALOG_UI_HOMES = {
  card: "src/components/playlists/catalog/PlaylistCard.tsx",
  grid: "src/components/playlists/catalog/PlaylistGrid.tsx",
  filters: "src/lib/playlists/listing-filters.ts",
  filterUi: "src/components/playlists/catalog/PlaylistCatalogFilters.tsx",
  saveAction: "src/app/api/playlists/saves/route.ts",
  playAction: "src/lib/playlists/catalog-playback.ts",
} as const;
