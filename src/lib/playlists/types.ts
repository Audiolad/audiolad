export const PLAYLIST_TITLE_MAX_LENGTH = 80;
export const PLAYLIST_MAX_PER_USER = 50;
export const PLAYLIST_MAX_ITEMS = 100;
export const PLAYLIST_MEMBERSHIP_MAX_IDS = 50;

export const PLAYLIST_VISIBILITIES = ["private", "public"] as const;

export type PlaylistVisibility = (typeof PLAYLIST_VISIBILITIES)[number];

export type PlaylistRow = {
  id: string;
  title: string;
  visibility: PlaylistVisibility;
  slug: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaylistListItem = PlaylistRow & {
  items_count: number;
};

export type PlaylistMembershipReason =
  | "ok"
  | "public_requires_free"
  | "entitlement_required";

export type PlaylistMembershipItem = {
  id: string;
  title: string;
  visibility: PlaylistVisibility;
  contains: boolean;
  itemsCount: number;
  canAdd: boolean;
  reason: PlaylistMembershipReason;
};

export type PlaylistApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "limit_reached"
  | "slug_conflict"
  | "public_content_invalid"
  | "entitlement_required"
  | "internal_error";
