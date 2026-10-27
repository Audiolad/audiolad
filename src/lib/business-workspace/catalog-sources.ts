import { AURAFON_AUTHOR_ID } from "@/lib/authors/aurafon";
import { CHILI_NA_VINILE_AUTHOR_ID } from "@/lib/authors/chili-na-vinile";
import { JAZZ_RELAX_AUTHOR_ID } from "@/lib/authors/jazz-relax";
import { KOFEYNIK_AUTHOR_ID } from "@/lib/authors/kofeynik";

import type { WorkspaceTrackShelf } from "./model";
import type { BusinessSpaceId } from "./spaces";

/**
 * Curated workspace music used only when `business_space_admissions` has no rows
 * for the space (task ba344b7f, first playable cafe cabinet).
 *
 * Lookup is `authors.id` only. Slugs and display names are comments, never a query key.
 * Four ids already live in `src/lib/authors/*`. The other two were taken from the
 * public author page `authorId` (the same `authors.id`) on 2026-10-27:
 * ol-ga and lara-larina. There is no UUID constant for them elsewhere in the repo.
 *
 * How to add an author:
 * 1. Copy `authors.id` (the author page `authorId`). Do not match by name or slug.
 * 2. Append a row: `spaces` that should include the author, `shelf` (`cafe`, or
 *    `other` for a separate group such as Aurafon), and `sounds`.
 * 3. `sounds` only picks the starting shelf from the demo profile on this device.
 *    It does not hide the other authors. Ids match the guest sound types
 *    (jazz, calm, rhythm, melodic). An empty list is never a starting shelf.
 * 4. The loader still keeps published, listed, non-deleted music practices and
 *    published tracks with playable audio, then `resolve_business_track_eligibility`.
 *    Anything other than ELIGIBLE is dropped. No database write is required.
 *
 * First release: the coffee projects plus Aurafon as its own group. Other
 * business-cleared authors stay out until a row is added here.
 */

/** authors.id for slug ol-ga. */
export const OLGA_NEVSKAYA_AUTHOR_ID = "f0f911f1-f1d5-45c4-8336-93ee2ec8ed30";

/** authors.id for slug lara-larina. */
export const LARA_LARINA_AUTHOR_ID = "e05f8fcd-6045-4258-a3ed-3ca0165501e6";

/** Guest sound-type ids. Same set as the demo direction axis. */
export const WORKSPACE_ATMOSPHERE_SOUNDS = ["jazz", "calm", "rhythm", "melodic"] as const;

export type WorkspaceAtmosphereSound = (typeof WORKSPACE_ATMOSPHERE_SOUNDS)[number];

export type WorkspaceCatalogSource = {
  authorId: string;
  spaces: readonly BusinessSpaceId[];
  shelf: WorkspaceTrackShelf;
  sounds: readonly WorkspaceAtmosphereSound[];
};

export const WORKSPACE_CATALOG_SOURCES: readonly WorkspaceCatalogSource[] = [
  // jazz-relax
  { authorId: JAZZ_RELAX_AUTHOR_ID, spaces: ["cafe"], shelf: "cafe", sounds: ["jazz"] },
  // kofeynik
  { authorId: KOFEYNIK_AUTHOR_ID, spaces: ["cafe"], shelf: "cafe", sounds: ["rhythm"] },
  // chili-na-vinile
  { authorId: CHILI_NA_VINILE_AUTHOR_ID, spaces: ["cafe"], shelf: "cafe", sounds: ["calm"] },
  // ol-ga
  { authorId: OLGA_NEVSKAYA_AUTHOR_ID, spaces: ["cafe"], shelf: "cafe", sounds: ["melodic"] },
  // lara-larina. In the catalog; the starting shelf for melodic is the earlier row.
  { authorId: LARA_LARINA_AUTHOR_ID, spaces: ["cafe"], shelf: "cafe", sounds: [] },
  // aurafon, separate group so it stays reachable from the cafe cabinet.
  { authorId: AURAFON_AUTHOR_ID, spaces: ["cafe"], shelf: "other", sounds: [] },
];

export function sourcesForSpace(spaceId: BusinessSpaceId): readonly WorkspaceCatalogSource[] {
  return WORKSPACE_CATALOG_SOURCES.filter((source) => source.spaces.includes(spaceId));
}
