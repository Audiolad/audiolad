export {
  canAccessCourseContent,
  evaluateCourseContentAccess,
  type CourseContentAccessInput,
  type CourseContentAccessOptions,
} from "@/lib/products/access";

export {
  COURSE_LESSON_BLOCK_TYPES,
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
