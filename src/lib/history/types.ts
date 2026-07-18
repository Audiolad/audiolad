export type HistoryFilter = "all" | "in-progress" | "completed";

export type HistoryPeriod = "today" | "yesterday" | "this-week" | "earlier";

export type HistoryItemStatus = "in-progress" | "completed";

export type HistoryProgressRow = {
  practice_id: string;
  audio_item_id: string;
  position_seconds: number;
  completed: boolean;
  updated_at: string;
};

export type AggregatedPracticeProgress = {
  practiceId: string;
  rows: HistoryProgressRow[];
  lastUpdatedAt: string;
};

import type { ProductCoverFields } from "@/lib/products/cover-display";

export type HistoryItem = ProductCoverFields & {
  practiceId: string;
  title: string;
  authorName: string | null;
  authorSlug: string | null;
  productSlug: string;
  formatLabel: string | null;
  metaLabel: string | null;
  isProgram: boolean;
  stepLabel: string | null;
  progressPercent: number;
  progressLabel: string;
  status: HistoryItemStatus;
  lastActivityAt: string;
  lastActivityLabel: string;
  canListen: boolean;
  actionLabel: string;
  actionHref: string;
};

export type HistoryGroup = {
  period: HistoryPeriod;
  title: string;
  items: HistoryItem[];
};

export type HistoryPageViewModel = {
  filter: HistoryFilter;
  groups: HistoryGroup[];
  totalCount: number;
  filteredCount: number;
};
