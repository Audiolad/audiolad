export const PLAYLIST_TITLE_MAX_LENGTH = 80;
export const EDITORIAL_DIRECTION_NAME_MAX_LENGTH = 80;
export const PLAYLIST_DESCRIPTION_MAX_LENGTH = 1000;
export const PLAYLIST_MAX_PER_USER = 50;
export const PLAYLIST_MAX_ITEMS = 100;
export const PLAYLIST_MEMBERSHIP_MAX_IDS = 50;

export const PLAYLIST_VISIBILITIES = ["private", "public"] as const;
export const PLAYLIST_OWNER_TYPES = ["user", "platform"] as const;
export const PLAYLIST_COLLABORATOR_ROLES = ["playlist_admin"] as const;
export const EDITORIAL_DIRECTION_MEMBER_ROLES = ["direction_editor"] as const;

export type PlaylistVisibility = (typeof PLAYLIST_VISIBILITIES)[number];
export type PlaylistOwnerType = (typeof PLAYLIST_OWNER_TYPES)[number];
export type PlaylistCollaboratorRole =
  (typeof PLAYLIST_COLLABORATOR_ROLES)[number];
export type EditorialDirectionMemberRole =
  (typeof EDITORIAL_DIRECTION_MEMBER_ROLES)[number];

export type PlaylistRow = {
  id: string;
  title: string;
  visibility: PlaylistVisibility;
  slug: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  cover_path: string | null;
  cover_image?: unknown;
  cover_updated_at: string | null;
  is_editorial: boolean;
  owner_type?: PlaylistOwnerType;
  user_id?: string | null;
  created_by?: string | null;
  description?: string | null;
  first_published_at?: string | null;
  direction_id?: string | null;
};

export type EditorialPlaylistListItem = {
  id: string;
  title: string;
  slug: string;
  published_at: string;
  updated_at: string;
  items_count: number;
  coverUrl: string | null;
  mosaicCoverUrls: Array<string | null>;
};

export type EditorialWorkspaceListItem = {
  id: string;
  title: string;
  slug: string | null;
  visibility: PlaylistVisibility;
  published_at: string | null;
  first_published_at: string | null;
  updated_at: string;
  items_count: number;
  unique_author_count: number;
  created_by: string | null;
  creatorName: string | null;
  coverUrl: string | null;
  mosaicCoverUrls: Array<string | null>;
  direction_id: string | null;
  directionName: string | null;
};

export type EditorialDirectionRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export type EditorialDirectionListItem = EditorialDirectionRow & {
  playlistCount: number;
  editors: Array<{
    userId: string;
    displayName: string;
    email: string | null;
  }>;
};

export type PlaylistListItem = PlaylistRow & {
  items_count: number;
  coverUrl: string | null;
  mosaicCoverUrls: Array<string | null>;
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
