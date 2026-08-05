"use client";

import { useId, useState } from "react";

import { SchoolMicIcon, SchoolSleepIcon } from "@/components/school/SchoolIcons";

type IconProps = {
  className?: string;
};

function iconClass(className?: string) {
  return className ?? "h-6 w-6";
}

function SchoolSparkIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5v3" />
      <path d="M12 17.5v3" />
      <path d="M3.5 12h3" />
      <path d="M17.5 12h3" />
      <path d="m7.2 7.2 2.1 2.1" />
      <path d="m14.7 14.7 2.1 2.1" />
      <path d="m16.8 7.2-2.1 2.1" />
      <path d="m9.3 14.7-2.1 2.1" />
    </svg>
  );
}

function SchoolLayersIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4.5 9.5 7.5 4 7.5-4" />
      <path d="m4.5 13.5 7.5 4 7.5-4" />
      <path d="m4.5 5.5 7.5 4 7.5-4-7.5-4-7.5 4Z" />
    </svg>
  );
}

function SchoolPathIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="7" r="2" />
      <circle cx="17.5" cy="17" r="2" />
      <path d="M8.5 7.8c2.2 0 3.4 1.4 4.5 3.2 1.1 1.8 2.3 3.2 4.5 3.2" />
    </svg>
  );
}

function SchoolPodcastIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="10" r="2.25" />
      <path d="M8.2 12.8a4.5 4.5 0 0 1 7.6 0" />
      <path d="M12 12.25V17" />
      <path d="M9.5 17h5" />
      <path d="M5.8 9.2a6.5 6.5 0 0 1 12.4 0" />
    </svg>
  );
}

function SchoolLessonIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7.5h10.5a2 2 0 0 1 2 2V18" />
      <path d="M5 7.5V18h12.5" />
      <path d="M8.5 11h5" />
      <path d="M8.5 14h3.5" />
    </svg>
  );
}

function SchoolLectureIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="5" width="15" height="10.5" rx="1.5" />
      <path d="M9 19.5h6" />
      <path d="M12 15.5v4" />
    </svg>
  );
}

function SchoolMiniCourseIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="5.5" width="14" height="13" rx="2" />
      <path d="M9 9.5h6" />
      <path d="M9 12.5h6" />
      <path d="M9 15.5h3.5" />
    </svg>
  );
}

function SchoolVisionIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.8 12s2.8-5 8.2-5 8.2 5 8.2 5-2.8 5-8.2 5-8.2-5-8.2-5Z" />
      <circle cx="12" cy="12" r="2.25" />
    </svg>
  );
}

function SchoolBreathIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 16c-2.2 0-3.5-1.6-3.5-3.5S5.8 9 8 9c.6-2.2 2.4-3.5 4.5-3.5 2.6 0 4.5 1.9 4.8 4.3 1.7.3 3.2 1.7 3.2 3.7 0 2.1-1.7 3.5-3.8 3.5H8Z" />
    </svg>
  );
}

function SchoolEnergyIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 3.5 7 13h5l-1.5 7.5L17 11h-5l1.5-7.5Z" />
    </svg>
  );
}

function SchoolPrayerIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4.5v15" />
      <path d="M8.5 8.5c1.2-1.4 2.3-2.1 3.5-2.1s2.3.7 3.5 2.1" />
      <path d="M8.5 15.5c1.2 1.4 2.3 2.1 3.5 2.1s2.3-.7 3.5-2.1" />
    </svg>
  );
}

function SchoolTuneIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 8.5h8.5" />
      <path d="M10.5 15.5H19" />
      <circle cx="16.5" cy="8.5" r="2" />
      <circle cx="7.5" cy="15.5" r="2" />
    </svg>
  );
}

const TITLE = "Что такое авторский аудиопродукт?";

const INTRO_PARAGRAPHS = [
  "Авторский аудиопродукт – это ваш голос, знания, опыт и внутреннее состояние, объединённые в единый продукт, который люди могут слушать в любое удобное время.",
  "Это может быть запись только с голосом или с музыкальным сопровождением, если оно помогает раскрыть замысел автора.",
  "Через аудиоформат можно передавать знания, сопровождать человека в практике, вдохновлять, поддерживать, обучать и помогать менять своё состояние и жизнь.",
] as const;

const FORMATS_SUBTITLE = "Что вы сможете создавать";

const CLOSING_LEAD = "И это только начало.";

const CLOSING_TEXT =
  "Со временем вы сможете создать собственную библиотеку авторских аудиопродуктов, объединённых общей темой, методикой и вашим уникальным стилем.";

/** First screenful on mobile: 3×2 grid, rest behind «Показать ещё». */
const MOBILE_VISIBLE_COUNT = 6;

const FORMATS = [
  { label: "Медитации", Icon: SchoolSleepIcon },
  { label: "Аудиопрактики", Icon: SchoolMicIcon },
  { label: "Аудиокурсы", Icon: SchoolLayersIcon },
  { label: "Аудиопрограммы", Icon: SchoolPathIcon },
  { label: "Подкасты", Icon: SchoolPodcastIcon },
  { label: "Аудиоуроки", Icon: SchoolLessonIcon },
  { label: "Лекции", Icon: SchoolLectureIcon },
  { label: "Мини-курсы", Icon: SchoolMiniCourseIcon },
  { label: "Визуализации", Icon: SchoolVisionIcon },
  { label: "Дыхательные практики", Icon: SchoolBreathIcon },
  { label: "Энергетические практики", Icon: SchoolEnergyIcon },
  { label: "Молитвы", Icon: SchoolPrayerIcon },
  { label: "Настрои", Icon: SchoolTuneIcon },
] as const;

export default function SchoolThirdScreen() {
  const [expanded, setExpanded] = useState(false);
  const formatsId = useId();
  const hiddenCount = FORMATS.length - MOBILE_VISIBLE_COUNT;

  return (
    <section
      className="school-third-screen"
      aria-label="Что такое авторский аудиопродукт"
    >
      <h2 className="school-third-screen__title">{TITLE}</h2>

      <div className="school-third-screen__intro">
        {INTRO_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph} className="school-third-screen__intro-text">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="school-third-screen__formats">
        <div className="school-third-screen__formats-heading">
          <span className="school-third-screen__formats-mark" aria-hidden="true">
            <SchoolSparkIcon className="school-third-screen__formats-mark-icon" />
          </span>
          <h3 className="school-third-screen__formats-title">
            {FORMATS_SUBTITLE}
          </h3>
        </div>

        <ul
          id={formatsId}
          className={
            expanded
              ? "school-third-screen__format-grid school-third-screen__format-grid--expanded"
              : "school-third-screen__format-grid"
          }
        >
          {FORMATS.map(({ label, Icon }, index) => {
            const isCollapsedHidden = !expanded && index >= MOBILE_VISIBLE_COUNT;
            return (
              <li
                key={label}
                className={
                  isCollapsedHidden
                    ? "school-third-screen__format school-third-screen__format--collapsed"
                    : "school-third-screen__format"
                }
              >
                <span className="school-third-screen__format-icon-wrap">
                  <Icon className="school-third-screen__format-icon" />
                </span>
                <span className="school-third-screen__format-label">{label}</span>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="school-third-screen__more"
          aria-expanded={expanded}
          aria-controls={formatsId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Свернуть" : `Показать ещё · ${hiddenCount}`}
        </button>
      </div>

      <div className="school-third-screen__closing">
        <p className="school-third-screen__closing-lead">{CLOSING_LEAD}</p>
        <p className="school-third-screen__closing-text">{CLOSING_TEXT}</p>
      </div>
    </section>
  );
}
