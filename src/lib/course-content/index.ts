export {
  canAccessCourseContent,
  evaluateCourseContentAccess,
  type CourseContentAccessInput,
  type CourseContentAccessOptions,
} from "@/lib/products/access";

export {
  attachCourseLearnerAccessHelpers,
  canAccessRequiredLevel,
  evaluateCourseLearnerAccess,
  resolveCourseLearnerAccess,
  resolveCourseLearnerAccessAfterProductAccess,
  type CourseLearnerAccess,
  type CourseLearnerAccessOptions,
  type CourseLearnerAccessSnapshot,
} from "./learner-access";

export type {
  LearnerCourse,
  LearnerCourseAudioBlock,
  LearnerCourseBlock,
  LearnerCourseFileBlock,
  LearnerCourseItemKind,
  LearnerCourseLesson,
  LearnerCourseLevel,
  LearnerCourseTextBlock,
} from "./learner-types";

export {
  assertLearnerLessonRedacted,
  collectLockedLessonItemKinds,
  mapPracticeAccessLevels,
  normalizeRequiredAccessLevel,
  serializeLearnerCourse,
  toLearnerCourse,
  toLearnerCourseLesson,
} from "./learner-dto";

export {
  formatLearnerLevelHeading,
  groupLearnerCourse,
  learnerLevelUpgradeLabel,
  type LearnerCourseLevelChrome,
  type LearnerCourseLevelGroup,
  type LearnerCourseView,
} from "./learner-groups";

export {
  canAccessCourseAssetAssociation,
  canDownloadCoursePublicationFile,
  canPlayCourseAudioItem,
  listAccessibleCourseAudioItemIds,
  listCourseStorefrontPreviewAudioItemIds,
  loadCourseBlockAssociations,
} from "./learner-assets";

export {
  COURSE_STOREFRONT_PREVIEW_MAX_ACCESS_LEVEL,
  collectCourseLevel1AudioItemIds,
  isCourseLessonEligibleForStorefrontPreview,
  isCourseStorefrontPreviewAudioReady,
  isCourseStorefrontPreviewClipEligible,
  resolveCourseStorefrontPreviewAvailable,
  shouldShowPaidBuyPreviewCta,
} from "./storefront-preview";
export { loadCourseStorefrontPreviewAvailable } from "./storefront-preview-availability";

export {
  COURSE_LESSON_BLOCK_TYPES,
  PUBLICATION_FILE_MAX_PDF_BYTES,
  PUBLICATION_FILE_PDF_MIME,
  type CourseAudioBlockPayload,
  type CourseCompletionCta,
  type CourseFileBlockPayload,
  type CourseLesson,
  type CourseLessonBlock,
  type CourseLessonBlockPayload,
  type CourseLessonBlockType,
  type CourseTextBlockPayload,
  type PublicationFile,
} from "./types";

export {
  PUBLICATION_FILE_LIMITS,
  hasPdfMagicBytes,
  isAllowedPdfMimeType,
  isCourseLessonBlockType,
  isCoursePublication,
  isPublicationFilePdfMime,
  validateCourseLessonBlock,
  validateCourseParentClass,
  validatePublicationPdfUpload,
} from "./validators";

export {
  PUBLICATION_FILES_BUCKET,
  buildPublicationFileStoragePath,
  createPublicationFileSignedUrl,
  signPublicationFileIfAllowed,
} from "./storage";
