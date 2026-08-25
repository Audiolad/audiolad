/**
 * Homes for playlist catalog UI.
 * Stage 3A created `card` and `grid`. Stage 3B.1 created `saveAction`.
 * Stage 3B.2 created `playAction`. Stage 4A created search/sort and the
 * listing-filters href helper. Stage 4B.1 created playlist_topics data/listing.
 * Stage 4B.3 created catalog topic filter UI. Access filter UI stays later-stage.
 * `filterUi` / PlaylistCatalogFilters.tsx must remain missing.
 */
export const PLAYLIST_CATALOG_UI_HOMES = {
  card: "src/components/playlists/catalog/PlaylistCard.tsx",
  grid: "src/components/playlists/catalog/PlaylistGrid.tsx",
  searchUi: "src/components/playlists/catalog/PlaylistCatalogSearch.tsx",
  sortUi: "src/components/playlists/catalog/PlaylistCatalogSort.tsx",
  topicFilter: "src/components/playlists/catalog/PlaylistCatalogTopicFilter.tsx",
  filters: "src/lib/playlists/listing-filters.ts",
  filterUi: "src/components/playlists/catalog/PlaylistCatalogFilters.tsx",
  saveAction: "src/app/api/playlists/saves/route.ts",
  playAction: "src/lib/playlists/catalog-playback.ts",
} as const;
