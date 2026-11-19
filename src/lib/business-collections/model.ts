export const COLLECTION_COOKIE = "al_coffee_collection";
export const COLLECTION_ADMIN_PATH = "/admin/business-catalog/collections";
export const COLLECTION_API = "/api/business/collections";
export const COLLECTION_TOKEN = /^[0-9a-f]{64}$/;
export const COLLECTION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CollectionTrack = {
  audioItemId: string;
  albumId: string;
  title: string;
  albumTitle: string;
  durationSeconds: number | null;
  coverUrl: string;
};
export type PersonalCollection = { id: string; title: string; tracks: CollectionTrack[] };

export { resolveCollectionPermission } from "./permissions.mjs";

export function collectionTrackPath(kind: "audio" | "cover", collectionId: string, trackId: string): string {
  return `${COLLECTION_API}/${kind}?${new URLSearchParams({ collection: collectionId, track: trackId })}`;
}
