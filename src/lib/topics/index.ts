export {
  DEFAULT_AUTHOR_TOPIC_LIMIT,
  PLAN_TOPIC_LIMITS,
  assertPublishedTopicMinimum,
  assertTopicCountWithinLimit,
  resolveAuthorTopicLimit,
} from "./limits";
export type { AuthorPlanSlug, AuthorTopicLimitContext } from "./limits";

export {
  extractTopicErrorCode,
  getTopicErrorMessage,
  mapTopicRpcError,
} from "./errors";

export {
  countActivePracticeTopics,
  getPracticeTopicKeys,
  getPracticeTopics,
  getTopicBySlug,
  listActiveTopics,
  listHomeTopics,
  listHomeTopicsWithCatalogCounts,
  listTopicsWithCatalogCounts,
} from "./queries";

export { isSetPracticeTopicsResult, setPracticeTopics } from "./sync";
export type { SetPracticeTopicsResponse } from "./sync";

export type {
  AssignedTopic,
  PracticeTopicsResult,
  SetPracticeTopicsResult,
  TopicErrorCode,
  TopicOption,
  TopicRow,
  TopicWithCatalogCount,
} from "./types";
export { TOPIC_ERROR_CODES } from "./types";
