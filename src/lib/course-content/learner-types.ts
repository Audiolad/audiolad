import type { CourseLessonBlockType } from "./types";

export type LearnerCourseLevel = {
  level: number;
  title: string;
  description: string | null;
  upgradePrice: number | null;
  currency: string | null;
  /**
   * Future upgrade checkout. Omitted until a later PR supplies an action.
   * The locked UI must not render a dead button when this is absent.
   */
  upgradeAction?: { href: string } | null;
};

export type LearnerCourseTextBlock = {
  id: string;
  type: "text";
  position: number;
  text: string;
};

export type LearnerCourseAudioBlock = {
  id: string;
  type: "audio";
  position: number;
  audioItemId: string;
  title: string;
  durationSeconds: number | null;
};

export type LearnerCourseFileBlock = {
  id: string;
  type: "file";
  position: number;
  fileId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
};

export type LearnerCourseBlock =
  | LearnerCourseTextBlock
  | LearnerCourseAudioBlock
  | LearnerCourseFileBlock;

export type LearnerCourseLesson = {
  id: string;
  title: string;
  position: number;
  requiredAccessLevel: number;
  locked: boolean;
  blocks?: LearnerCourseBlock[];
};

export type LearnerCourse = {
  publicationId: string;
  accessLevel: number | null;
  privileged: boolean;
  levels: LearnerCourseLevel[];
  lessons: LearnerCourseLesson[];
};

export type { CourseLessonBlockType };
