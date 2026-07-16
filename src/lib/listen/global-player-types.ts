import type { ListenProgressEntry, ListenTrack } from "@/lib/listen/types";

export type GlobalPlayerSession = {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  practiceTitle: string;
  authorName: string;
  format: string | null;
  tracks: ListenTrack[];
  initialProgress: ListenProgressEntry[];
  coverSymbol: string;
  coverGradient: string;
  coverImageUrl: string | null;
  isAuthorPreview: boolean;
  requestAutoplay?: boolean;
  /** When true, start at track 0 / position 0 (Play All restart). */
  forceStartAtBeginning?: boolean;
};

export type LoadSessionInput = GlobalPlayerSession;
