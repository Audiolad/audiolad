export const COLLECTION_COOKIE = "al_coffee_collection";
export const COLLECTION_ADMIN_PATH = "/admin/business-catalog/collections";
export const COLLECTION_API = "/api/business/collections";
/** At most this many accounts may start the app by one personal link (Sergey, 19.11.2026). */
export const COLLECTION_ACCOUNT_LIMIT = 10;
/** Cookie value after a dead link: valid shape, matches no collection (sha256 of it is never issued). */
export const COLLECTION_DEAD_MARKER = "0".repeat(64);
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

export { resolveCollectionPermission } from "./permissions.mjs";
