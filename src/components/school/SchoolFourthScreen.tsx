"use client";

import { useEffect, useRef, useState } from "react";

import { SchoolMicIcon, SchoolSleepIcon } from "@/components/school/SchoolIcons";

type IconProps = {
  className?: string;
};

function SchoolBloomIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-6 w-6"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2.1" />
      <path d="M12 4.5v3.2" />
      <path d="M12 16.3v3.2" />
      <path d="M4.5 12h3.2" />
      <path d="M16.3 12h3.2" />
      <path d="m7.4 7.4 2.2 2.2" />
      <path d="m14.4 14.4 2.2 2.2" />
      <path d="m16.6 7.4-2.2 2.2" />
      <path d="m9.6 14.4-2.2 2.2" />
    </svg>
  );
}

const TITLE = "Примеры авторских аудиопродуктов";

const INTRO =
  "Ваши знания и опыт могут стать основой самых разных аудиопродуктов.";

const INTRO_LEAD = "Например:";

const CLOSING_LEAD = "И это лишь несколько примеров.";

const CLOSING_TEXT =
  "Вы сможете создавать отдельные аудиопрактики, тематические серии, программы, аудиокурсы и целые авторские библиотеки на темы, которые действительно вас волнуют.";

const EXAMPLES = [
  {
    title: "Глубокое расслабление",
    description:
      "Медитация для снятия внутреннего напряжения и восстановления спокойствия.",
    tone: "cream",
    Icon: SchoolSleepIcon,
  },
  {
    title: "Ключ к Изобилию",
    description:
      "Аудиопрактика для работы с внутренними ограничениями и формирования нового отношения к деньгам.",
    tone: "lilac",
    Icon: SchoolMicIcon,
  },
  {
    title: "Возвращение к себе",
    description:
      "Практика для восстановления внутренней опоры и более глубокого контакта с собой.",
    tone: "mist",
    Icon: SchoolBloomIcon,
  },
  {
    title: "Восстановление женской энергии",
    description:
      "Медитация для наполнения, расслабления и бережного отношения к себе.",
    tone: "cream",
    Icon: SchoolSleepIcon,
  },
  {
    title: "Освобождение от обиды",
    description:
      "Аудиопрактика для проживания чувств и внутреннего освобождения.",
    tone: "lilac",
    Icon: SchoolMicIcon,
  },
  {
    title: "Спокойный сон",
    description:
      "Вечерняя практика для расслабления тела и подготовки ко сну.",
    tone: "mist",
    Icon: SchoolSleepIcon,
  },
  {
    title: "Уверенный голос",
    description:
      "Аудиокурс для тех, кто хочет свободнее говорить, проявляться и доносить свои идеи.",
    tone: "lilac",
    Icon: SchoolMicIcon,
  },
] as const;

export default function SchoolFourthScreen() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const updateActive = () => {
      const cards = [
        ...track.querySelectorAll<HTMLElement>(".school-fourth-screen__example"),
      ];
      if (cards.length === 0) return;

      const trackLeft = track.scrollLeft;
      let nearest = 0;
      let nearestDist = Number.POSITIVE_INFINITY;

      for (let i = 0; i < cards.length; i += 1) {
        const dist = Math.abs(cards[i].offsetLeft - trackLeft);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      }

      setActiveIndex(nearest);
    };

    updateActive();
    track.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);

    return () => {
      track.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  return (
    <section
      className="school-fourth-screen"
      aria-label="Примеры авторских аудиопродуктов"
    >
      <h2 className="school-fourth-screen__title">{TITLE}</h2>

      <div className="school-fourth-screen__intro">
        <p className="school-fourth-screen__intro-text">{INTRO}</p>
        <p className="school-fourth-screen__intro-lead">{INTRO_LEAD}</p>
      </div>

      <div className="school-fourth-screen__carousel-shell">
        <ul
          ref={trackRef}
          className="school-fourth-screen__carousel"
          aria-label="Примеры аудиопродуктов"
        >
          {EXAMPLES.map(({ title, description, tone, Icon }) => (
            <li
              key={title}
              className={`school-fourth-screen__example school-fourth-screen__example--${tone}`}
            >
              <span
                className="school-fourth-screen__example-accent"
                aria-hidden="true"
              />
              <span className="school-fourth-screen__example-icon-wrap">
                <Icon className="school-fourth-screen__example-icon" />
              </span>
              <h3 className="school-fourth-screen__example-title">{title}</h3>
              <p className="school-fourth-screen__example-text">{description}</p>
            </li>
          ))}
        </ul>

        <div className="school-fourth-screen__dots" aria-hidden="true">
          {EXAMPLES.map(({ title }, index) => (
            <span
              key={title}
              className={
                index === activeIndex
                  ? "school-fourth-screen__dot school-fourth-screen__dot--active"
                  : "school-fourth-screen__dot"
              }
            />
          ))}
        </div>
      </div>

      <div className="school-fourth-screen__closing">
        <p className="school-fourth-screen__closing-lead">{CLOSING_LEAD}</p>
        <p className="school-fourth-screen__closing-text">{CLOSING_TEXT}</p>
      </div>
    </section>
  );
}
