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
  LearnerCourseLesson,
  LearnerCourseLevel,
  LearnerCourseTextBlock,
} from "./learner-types";

export {
  assertLearnerLessonRedacted,
  mapPracticeAccessLevels,
  normalizeRequiredAccessLevel,
  serializeLearnerCourse,
  toLearnerCourse,
  toLearnerCourseLesson,
} from "./learner-dto";

export {
  canAccessCourseAssetAssociation,
  canDownloadCoursePublicationFile,
  canPlayCourseAudioItem,
  listAccessibleCourseAudioItemIds,
  loadCourseBlockAssociations,
} from "./learner-assets";

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
