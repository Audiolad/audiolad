import FormattedPlainText from "@/components/FormattedPlainText";
import {
  groupLearnerCourse,
  type LearnerCourseLevelChrome,
} from "@/lib/course-content/learner-groups";
import type { LearnerCourse, LearnerCourseLesson } from "@/lib/course-content/learner-types";
import { COURSE_LEARNER_CONTENTS_ANCHOR_ID } from "@/lib/products/practice-access-ui";

import CourseLearnerAudioBlock from "./CourseLearnerAudioBlock";
import CourseLearnerFileDownload from "./CourseLearnerFileDownload";
import CourseLevelUpgradeButton from "./CourseLevelUpgradeButton";

type CourseLearnerContentProps = {
  course: LearnerCourse;
  authorSlug: string;
  productSlug: string;
};

function UnlockedLesson({
  lesson,
  index,
  authorSlug,
  productSlug,
  headingLevel,
}: {
  lesson: LearnerCourseLesson;
  index: number;
  authorSlug: string;
  productSlug: string;
  headingLevel: "h3" | "h4";
}) {
  const Heading = headingLevel;

  return (
    <article className="min-w-0 max-w-full rounded-[20px] border border-[#f0e6fb] bg-[#fcfaff] px-4 py-4">
      <Heading className="min-w-0 break-words text-[16px] font-semibold text-[#25135c]">
        <span className="mr-2 tabular-nums text-[#8a7ca9]">{index}.</span>
        {lesson.title}
      </Heading>
      <div className="mt-3 min-w-0 max-w-full space-y-3">
        {(lesson.blocks ?? []).map((block) => {
          if (block.type === "text") {
            return (
              <FormattedPlainText
                key={block.id}
                text={block.text}
                className="text-sm leading-6 text-[#3f3560]"
              />
            );
          }

          if (block.type === "audio") {
            return (
              <CourseLearnerAudioBlock
                key={block.id}
                block={block}
                authorSlug={authorSlug}
                productSlug={productSlug}
              />
            );
          }

          return (
            <CourseLearnerFileDownload
              key={block.id}
              block={block}
              authorSlug={authorSlug}
              productSlug={productSlug}
            />
          );
        })}
      </div>
    </article>
  );
}

function LockedLessonTitle({
  lesson,
  headingLevel,
}: {
  lesson: LearnerCourseLesson;
  headingLevel: "h3" | "h4";
}) {
  const Heading = headingLevel;

  return (
    <article className="min-w-0 max-w-full rounded-[20px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-4">
      <Heading className="min-w-0 break-words text-[16px] font-semibold text-[#3f3560]">
        {lesson.title}
      </Heading>
    </article>
  );
}

function LevelChrome({ chrome }: { chrome: LearnerCourseLevelChrome }) {
  return (
    <header className="min-w-0 space-y-2">
      <h3 className="min-w-0 break-words text-[16px] font-semibold text-[#25135c]">{chrome.heading}</h3>
      {chrome.description ? (
        <p className="text-sm leading-6 text-[#7d70a2]">{chrome.description}</p>
      ) : null}
    </header>
  );
}

function LevelUpgrade({ chrome }: { chrome: LearnerCourseLevelChrome }) {
  if (!chrome.upgradePriceLabel && !chrome.upgradeAction) {
    return null;
  }

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {chrome.upgradePriceLabel ? (
        <p className="text-sm font-semibold text-[#7042c5]">{chrome.upgradePriceLabel}</p>
      ) : null}
      {chrome.upgradeAction?.kind === "course_upgrade" &&
      chrome.upgradeAction.practiceId &&
      chrome.upgradeAction.targetAccessLevel ? (
        <CourseLevelUpgradeButton
          practiceId={chrome.upgradeAction.practiceId}
          targetAccessLevel={chrome.upgradeAction.targetAccessLevel}
          label={chrome.upgradeAction.label}
        />
      ) : chrome.upgradeAction?.href ? (
        <a
          href={chrome.upgradeAction.href}
          className="inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
        >
          {chrome.upgradeAction.label}
        </a>
      ) : null}
    </div>
  );
}

function LessonList({
  lessons,
  startIndex,
  authorSlug,
  productSlug,
  headingLevel,
}: {
  lessons: readonly LearnerCourseLesson[];
  startIndex: number;
  authorSlug: string;
  productSlug: string;
  headingLevel: "h3" | "h4";
}) {
  return (
    <ol className="min-w-0 max-w-full space-y-4">
      {lessons.map((lesson, offset) => (
        <li key={lesson.id}>
          {lesson.locked ? (
            <LockedLessonTitle lesson={lesson} headingLevel={headingLevel} />
          ) : (
            <UnlockedLesson
              lesson={lesson}
              index={startIndex + offset}
              authorSlug={authorSlug}
              productSlug={productSlug}
              headingLevel={headingLevel}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

export default function CourseLearnerContent({
  course,
  authorSlug,
  productSlug,
}: CourseLearnerContentProps) {
  if (course.lessons.length === 0) {
    return null;
  }

  const view = groupLearnerCourse(course);

  return (
    <section
      id={COURSE_LEARNER_CONTENTS_ANCHOR_ID}
      className="mt-6 min-w-0 max-w-full rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
    >
      <h2 className="min-w-0 break-words text-[17px] font-semibold text-[#25135c]">Содержание курса</h2>

      {view.kind === "flat" ? (
        <div className="mt-4">
          <LessonList
            lessons={view.lessons}
            startIndex={1}
            authorSlug={authorSlug}
            productSlug={productSlug}
            headingLevel="h3"
          />
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {view.groups.map((group, groupIndex) => {
            const startIndex =
              1 +
              view.groups
                .slice(0, groupIndex)
                .reduce((total, item) => total + item.lessons.length, 0);
            const headingLevel = group.chrome ? "h4" : "h3";

            return (
              <section
                key={group.requiredAccessLevel}
                className="min-w-0 max-w-full space-y-3"
                data-learner-level={group.requiredAccessLevel}
              >
                {group.chrome ? <LevelChrome chrome={group.chrome} /> : null}
                <LessonList
                  lessons={group.lessons}
                  startIndex={startIndex}
                  authorSlug={authorSlug}
                  productSlug={productSlug}
                  headingLevel={headingLevel}
                />
                {group.chrome ? <LevelUpgrade chrome={group.chrome} /> : null}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
