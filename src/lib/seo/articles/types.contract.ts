import type {
  CreatorArticleDefinition,
  PracticeArticleDefinition,
} from "./types";

const baseArticle = {
  slug: "type-contract",
  title: "Type contract",
  breadcrumbTitle: "Type contract",
  metaTitle: "Type contract",
  metaDescription: "Type contract",
  leadBeforeAudio: "Lead",
  shortAnswer: "Answer",
  authorLabel: "АудиоЛад",
  topicSlug: "articles",
  topicTitle: "Статьи",
  topicHref: "/articles",
  faq: [],
  sections: [],
  introAfterAudio: [],
  seeAlsoLinks: [],
  closingSection: {
    id: "main",
    title: "Главное",
    paragraphs: [],
  },
  publishedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const practiceFields = {
  captionAfterAudio: "Caption",
  primaryPracticeEyebrow: "Practice",
  primaryPracticeIntro: "Practice intro",
  primaryPractice: { practiceKey: "practice" },
  relatedPractices: [],
  finalAudioLead: "Final audio",
};

const validPractice: PracticeArticleDefinition = {
  ...baseArticle,
  ...practiceFields,
  productContinuation: { kind: "practice" },
};

const validCreator: CreatorArticleDefinition = {
  ...baseArticle,
  productContinuation: {
    kind: "creator_paths",
    emphasis: "balanced",
  },
};

// @ts-expect-error A practice definition must always state its continuation kind.
const practiceWithoutKind: PracticeArticleDefinition = {
  ...baseArticle,
  ...practiceFields,
};

const practiceWithCreatorPaths: PracticeArticleDefinition = {
  ...baseArticle,
  ...practiceFields,
  productContinuation: {
    // @ts-expect-error Practice definitions cannot use creator paths.
    kind: "creator_paths",
    emphasis: "balanced",
  },
};

const creatorWithPrimaryPractice: CreatorArticleDefinition = {
  ...baseArticle,
  productContinuation: {
    kind: "creator_paths",
    emphasis: "balanced",
  },
  // @ts-expect-error Creator definitions cannot carry a primary practice.
  primaryPractice: { practiceKey: "practice" },
};

const creatorWithPracticeCopy: CreatorArticleDefinition = {
  ...baseArticle,
  productContinuation: {
    kind: "creator_paths",
    emphasis: "balanced",
  },
  // @ts-expect-error Creator definitions cannot carry practice-only copy.
  captionAfterAudio: "Caption",
};

void validPractice;
void validCreator;
void practiceWithoutKind;
void practiceWithCreatorPaths;
void creatorWithPrimaryPractice;
void creatorWithPracticeCopy;
