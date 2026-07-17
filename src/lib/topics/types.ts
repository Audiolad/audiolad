export type TopicRow = {
  id: string;
  key: string;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  show_on_home: boolean;
  created_at: string;
  updated_at: string;
};

export type TopicOption = {
  key: string;
  slug: string;
  title: string;
  description: string | null;
  sortOrder: number;
  showOnHome: boolean;
};

export type TopicWithCatalogCount = TopicOption & {
  catalogProductCount: number;
};

export type AssignedTopic = TopicOption & {
  isActive: boolean;
};

export type PracticeTopicsResult = {
  activeTopics: AssignedTopic[];
  archivedTopics: AssignedTopic[];
};

export type SetPracticeTopicsResult = {
  practice_id: string;
  topic_keys: string[];
  topic_count: number;
  topic_limit: number;
};

export const TOPIC_ERROR_CODES = [
  "topic_not_found",
  "topic_limit_exceeded",
  "topic_min_required",
  "duplicate_topic_keys",
  "topic_keys_required",
  "practice_id_required",
  "practice_not_found",
  "not_authenticated",
  "forbidden",
] as const;

export type TopicErrorCode = (typeof TOPIC_ERROR_CODES)[number];
