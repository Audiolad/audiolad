import type { AuthorWorkspace } from "@/lib/author-products/types";
import type { ProfileApplicationVariant } from "@/lib/author-applications/types";

export type ProfileCounterKey = "library" | "playlists" | "completed";

export type ProfileCounter = {
  key: ProfileCounterKey;
  value: number | null;
  label: string;
  href: string | null;
};

export type ProfileCardData = {
  displayName: string;
  initial: string;
  email: string;
  avatarUrl: string | null;
  rolePrimaryLabel: string;
  authorWorkspaceCountLabel: string | null;
};

export type ProfileAuthorSection =
  | { kind: "member"; workspaces: AuthorWorkspace[] }
  | {
      kind: "application";
      variant: ProfileApplicationVariant;
      reviewComment?: string | null;
    };

export type ProfilePageData = {
  card: ProfileCardData;
  counters: ProfileCounter[];
  authorSection: ProfileAuthorSection;
  showAdminPanel: boolean;
};
