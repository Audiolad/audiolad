import type { CourseLessonBlockType } from "./types";

export type LearnerCourseUpgradeAction = {
  href?: string;
  kind?: "course_upgrade";
  practiceId?: string;
  targetAccessLevel?: number;
};

export type LearnerCourseLevel = {
  level: number;
  title: string;
  description: string | null;
  upgradePrice: number | null;
  currency: string | null;
  /**
   * Native sequential upgrade checkout, or a legacy href for tests.
   * The locked UI must not render a dead button when this is absent.
   */
  upgradeAction?: LearnerCourseUpgradeAction | null;
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

export type LearnerCourseItemKind = "audio" | "file";

export type LearnerCourseLesson = {
  id: string;
  title: string;
  position: number;
  requiredAccessLevel: number;
  locked: boolean;
  blocks?: LearnerCourseBlock[];
  /**
   * Safe type cues for locked lessons (audio / file only).
   * Never includes ids, titles, paths, or text payloads.
   */
  itemKinds?: LearnerCourseItemKind[];
};

export type LearnerCourse = {
  publicationId: string;
  accessLevel: number | null;
  privileged: boolean;
  levels: LearnerCourseLevel[];
  lessons: LearnerCourseLesson[];
};

export type { CourseLessonBlockType };
