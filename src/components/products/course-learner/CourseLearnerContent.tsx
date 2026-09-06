import FormattedPlainText from "@/components/FormattedPlainText";
import { formatRubles } from "@/lib/products/price-format";
import type {
  LearnerCourse,
  LearnerCourseLesson,
  LearnerCourseLevel,
} from "@/lib/course-content/learner-types";

import CourseLearnerAudioBlock from "./CourseLearnerAudioBlock";
import CourseLearnerFileDownload from "./CourseLearnerFileDownload";

type CourseLearnerContentProps = {
  course: LearnerCourse;
  authorSlug: string;
  productSlug: string;
};

function levelForLesson(
  levels: readonly LearnerCourseLevel[],
  requiredAccessLevel: number,
): LearnerCourseLevel | null {
  return levels.find((level) => level.level === requiredAccessLevel) ?? null;
}

function LockedLesson({
  lesson,
  level,
  showLevelChrome,
}: {
  lesson: LearnerCourseLesson;
  level: LearnerCourseLevel | null;
  showLevelChrome: boolean;
}) {
  const upgradeLabel =
    showLevelChrome && level?.upgradePrice
      ? `Доплата ${formatRubles(level.upgradePrice)}`
      : null;
  const upgradeHref = level?.upgradeAction?.href?.trim() || null;

  return (
    <article className="rounded-[20px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-4">
      <h3 className="text-[16px] font-semibold text-[#3f3560]">{lesson.title}</h3>
      {showLevelChrome && level?.title ? (
        <p className="mt-1 text-sm font-medium text-[#7d70a2]">{level.title}</p>
      ) : null}
      {showLevelChrome && level?.description ? (
        <p className="mt-2 text-sm leading-6 text-[#7d70a2]">{level.description}</p>
      ) : null}
      {upgradeLabel ? (
        <p className="mt-3 text-sm font-semibold text-[#7042c5]">{upgradeLabel}</p>
      ) : null}
      {upgradeHref ? (
        <a
          href={upgradeHref}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
        >
          {upgradeLabel ?? "Открыть уровень"}
        </a>
      ) : null}
    </article>
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

  const showLevelChrome = course.levels.length > 0;

  return (
    <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
      <h2 className="text-[17px] font-semibold text-[#25135c]">Содержание курса</h2>

      <ol className="mt-4 space-y-4">
        {course.lessons.map((lesson, index) => (
          <li key={lesson.id}>
            {lesson.locked ? (
              <LockedLesson
                lesson={lesson}
                level={levelForLesson(course.levels, lesson.requiredAccessLevel)}
                showLevelChrome={showLevelChrome}
              />
            ) : (
              <article className="rounded-[20px] border border-[#f0e6fb] bg-[#fcfaff] px-4 py-4">
                <h3 className="text-[16px] font-semibold text-[#25135c]">
                  <span className="mr-2 tabular-nums text-[#8a7ca9]">
                    {index + 1}.
                  </span>
                  {lesson.title}
                </h3>
                <div className="mt-3 space-y-3">
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
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
