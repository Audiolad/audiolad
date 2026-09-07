import type { LearnerCourseItemKind } from "@/lib/course-content/learner-types";

export const COURSE_LEARNER_AUDIO_ITEM_LABEL = "Слушать";
export const COURSE_LEARNER_FILE_ITEM_LABEL = "Открыть документ";

type CourseLearnerItemTypeIconProps = {
  kind: LearnerCourseItemKind;
  className?: string;
};

export function courseLearnerItemKindLabel(
  kind: LearnerCourseItemKind,
  locked = false,
): string {
  if (kind === "audio") {
    return locked ? "Аудио" : COURSE_LEARNER_AUDIO_ITEM_LABEL;
  }

  return locked ? "Документ" : COURSE_LEARNER_FILE_ITEM_LABEL;
}

export default function CourseLearnerItemTypeIcon({
  kind,
  className,
}: CourseLearnerItemTypeIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 shrink-0 ${className ?? "text-[#7042c5]"}`}
      aria-hidden="true"
      focusable="false"
      data-course-item-kind={kind}
    >
      {kind === "audio" ? (
        <path
          fill="currentColor"
          d="M8.25 5.75v12.5a.75.75 0 0 0 1.17.62l9.5-6.25a.75.75 0 0 0 0-1.24l-9.5-6.25a.75.75 0 0 0-1.17.62Z"
        />
      ) : (
        <>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
            d="M7 3.75h7.2L17.25 7v13.25H7A1.25 1.25 0 0 1 5.75 19V5A1.25 1.25 0 0 1 7 3.75Z"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            d="M14 3.75V7h3.25M8.75 12h6.5M8.75 15.25h6.5"
          />
        </>
      )}
    </svg>
  );
}
