import { AURAFON_AUTHOR_ID } from "@/lib/authors/aurafon";
import { CHILI_NA_VINILE_AUTHOR_ID } from "@/lib/authors/chili-na-vinile";
import { JAZZ_RELAX_AUTHOR_ID } from "@/lib/authors/jazz-relax";
import { KOFEYNIK_AUTHOR_ID } from "@/lib/authors/kofeynik";

import type { WorkspaceTrackShelf } from "./model";
import type { BusinessSpaceId } from "./spaces";

/**
 * Presentation hints and personal onboarding-preview sources only.
 * These UUIDs never grant Business playback. The workspace loads all published
 * music, then the common SQL engine requires manual artist/album admission
 * for the venue category AND active legal eligibility.
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
  // aurafon presentation hint; cafe playback still requires explicit manual approval.
  { authorId: AURAFON_AUTHOR_ID, spaces: ["cafe"], shelf: "other", sounds: [] },
];

export function sourcesForSpace(spaceId: BusinessSpaceId): readonly WorkspaceCatalogSource[] {
  return WORKSPACE_CATALOG_SOURCES.filter((source) => source.spaces.includes(spaceId));
}
