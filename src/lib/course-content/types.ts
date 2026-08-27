/**
 * Phase 2A Course Content types.
 *
 * Course → Lesson → LessonBlock. No Section.
 *
 * Access invariant: the presence of a lesson / block / file / CTA row
 * never grants read. Future learner API must resolve the parent course,
 * then canAccessCourseContent, then read via server + service role.
 * Do not add GET-by-lesson-id without a parent check.
 */

export const COURSE_LESSON_BLOCK_TYPES = ["audio", "text", "file"] as const;

export type CourseLessonBlockType = (typeof COURSE_LESSON_BLOCK_TYPES)[number];

export const PUBLICATION_FILE_PDF_MIME = "application/pdf" as const;

/** Course lesson PDF blocks (`publication_files`). Not personal-materials (20 MB). */
export const PUBLICATION_FILE_MAX_PDF_BYTES = 5 * 1024 * 1024;

export type CourseTextBlockPayload = {
  text: string;
};

export type CourseAudioBlockPayload = {
  [key: string]: unknown;
};

export type CourseFileBlockPayload = {
  filename?: string;
  mime?: string;
  size?: number;
};

export type CourseLessonBlockPayload =
  | CourseTextBlockPayload
  | CourseAudioBlockPayload
  | CourseFileBlockPayload
  | null;

export type CourseLesson = {
  id: string;
  publicationId: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type CourseLessonBlock = {
  id: string;
  lessonId: string;
  type: CourseLessonBlockType;
  position: number;
  assetId: string | null;
  payload: CourseLessonBlockPayload;
  createdAt: string;
  updatedAt: string;
};

export type PublicationFile = {
  id: string;
  publicationId: string;
  storagePath: string;
  mime: typeof PUBLICATION_FILE_PDF_MIME;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
  updatedAt: string;
};

export type CourseCompletionCta = {
  publicationId: string;
  title: string | null;
  description: string | null;
  buttonText: string | null;
  url: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
