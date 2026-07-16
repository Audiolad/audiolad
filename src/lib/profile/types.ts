import type { ContinueListeningItem } from "@/lib/home/types";
import type { AuthorWorkspace } from "@/lib/author-products/types";

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
  rolePrimaryLabel: string;
  authorWorkspaceCountLabel: string | null;
};

export type ProfileContinueState =
  | { kind: "item"; item: ContinueListeningItem }
  | { kind: "empty" }
  | { kind: "hidden" }
  | { kind: "error" };

export type ProfileAuthorSection =
  | { kind: "member"; workspaces: AuthorWorkspace[] }
  | { kind: "prospect" }
  | { kind: "hidden" };

export type ProfilePageData = {
  card: ProfileCardData;
  continueState: ProfileContinueState;
  counters: ProfileCounter[];
  authorSection: ProfileAuthorSection;
};
