import type { ReactNode } from "react";

import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";

type Feature = {
  id: string;
  title: string;
  text: readonly string[];
  icon: ReactNode;
};

type IconProps = {
  className?: string;
};

const TITLE = "Что вас ждёт после окончания Школы?";

const INTRO = [
  "После обучения вы не останетесь один на один со своими аудиопродуктами.",
  "Вы сможете опубликовать их на платформе АудиоЛад, оформить собственное пространство автора, находить первых слушателей и постепенно развивать своё авторское направление.",
] as const;

const PATH = ["Автор", "Публикация", "Слушатели", "Развитие"] as const;

const PLATFORM_TITLE =
  "АудиоЛад – пространство для вашей дальнейшей реализации";

const PLATFORM_TEXT = [
  "АудиоЛад создан как пространство, где авторы могут публиковать свои знания, находить слушателей, общаться с единомышленниками и постепенно превращать творчество в собственное направление.",
  "Ваши аудиопродукты смогут жить на платформе, помогать людям и продолжать работать на вас после окончания Школы.",
] as const;

const FINAL_ACCENT =
  "Вы завершите обучение и с готовыми материалами, и с реальным местом, где сможете продолжать развиваться как автор.";

const CTA_LABEL = "Создать своё авторское направление";

function iconClass(className?: string) {
  return className ?? "school-after__icon-svg";
}

function ProfileIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.2c1.4-3.1 3.6-4.6 6.5-4.6s5.1 1.5 6.5 4.6" />
    </svg>
  );
}

function PublishIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 4.5h5.2L18.5 9.8V19a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V6A1.5 1.5 0 0 1 8 4.5Z" />
      <path d="M13.2 4.5V9.8h5.3" />
      <path d="M9.5 13.5h5" />
      <path d="M9.5 16.5h3.5" />
    </svg>
  );
}

function FreePaidIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.75" y="8.25" width="14.5" height="11" rx="2" />
      <path d="M8.25 8.25V7A2.25 2.25 0 0 1 10.5 4.75h3A2.25 2.25 0 0 1 15.75 7v1.25" />
      <path d="M4.75 12.5h14.5" />
    </svg>
  );
}

function ListenersIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8.5" r="2.4" />
      <circle cx="16" cy="9.2" r="2" />
      <path d="M4.8 18.5c.9-2.4 2.5-3.6 4.2-3.6s3.3 1.2 4.2 3.6" />
      <path d="M13.2 15.4c.7-.9 1.7-1.4 2.8-1.4 1.4 0 2.5.8 3.2 2.2" />
    </svg>
  );
}

function CommunityIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8.2" cy="8.4" r="2.15" />
      <circle cx="15.8" cy="8.4" r="2.15" />
      <circle cx="12" cy="14.8" r="2.15" />
      <path d="M10.1 9.5 11.1 13" />
      <path d="M13.9 9.5 12.9 13" />
      <path d="M10.2 8.4h3.6" />
    </svg>
  );
}

function PromoteIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 16.5 9.2 7.5l3.1 5.2 2.5-3.7L19 16.5" />
      <path d="M4.5 18.5h15" />
    </svg>
  );
}

function IncomeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7.25" />
      <path d="M12 8.2v7.6" />
      <path d="M10.1 9.6c.4-.7 1.1-1.1 1.9-1.1 1.1 0 1.9.6 1.9 1.5S13.1 11.5 12 11.5s-1.9.55-1.9 1.5.8 1.5 1.9 1.5c.8 0 1.5-.4 1.9-1.1" />
    </svg>
  );
}

function GrowthIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 18.5h14" />
      <path d="M7.5 15.5c1.8-3.2 3.4-5.4 5.8-7.8" />
      <path d="M12.2 8.4h4.3v4.2" />
      <path d="M7.5 15.5h3.2" />
    </svg>
  );
}

function LotusMark({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 25.5c-2.6-2.1-4.3-4.5-5.1-7.1" />
      <path d="M16 25.5c2.6-2.1 4.3-4.5 5.1-7.1" />
      <path d="M16 24.2c-1.2-3.4-1-6.8.1-10.2" />
      <path d="M10.2 14.8c1.7-.2 3.5.2 5.1 1.2" />
      <path d="M21.8 14.8c-1.7-.2-3.5.2-5.1 1.2" />
      <path d="M8.5 18.2c1.1-2.4 2.8-4.2 5-5.4" />
      <path d="M23.5 18.2c-1.1-2.4-2.8-4.2-5-5.4" />
      <path d="M16 7.5c.4 1.5.5 3 .4 4.5" />
    </svg>
  );
}

const FEATURES: readonly Feature[] = [
  {
    id: "profile",
    title: "Собственный профиль автора",
    text: [
      "У вас появится личная страница на АудиоЛаде, где слушатели смогут познакомиться с вами, вашим подходом и всеми созданными аудиопродуктами.",
    ],
    icon: <ProfileIcon />,
  },
  {
    id: "publish",
    title: "Публикация аудиопродуктов",
    text: [
      "Вы сможете размещать медитации, аудиопрактики, программы, аудиокурсы, лекции и другие материалы в удобном формате.",
    ],
    icon: <PublishIcon />,
  },
  {
    id: "pricing",
    title: "Бесплатные и платные продукты",
    text: [
      "Вы сможете самостоятельно выбирать, какие аудиопродукты использовать для знакомства с аудиторией, а какие предлагать за оплату.",
    ],
    icon: <FreePaidIcon />,
  },
  {
    id: "listeners",
    title: "Первые слушатели",
    text: [
      "Опубликованные продукты смогут находить люди, которым близка ваша тема, голос, методика и внутреннее состояние.",
    ],
    icon: <ListenersIcon />,
  },
  {
    id: "community",
    title: "Сообщество авторов аудиопродуктов",
    text: [
      "Вы станете частью сообщества людей, которые создают медитации, аудиопрактики, программы и аудиокурсы, развивают собственные проекты и помогают друг другу двигаться вперёд.",
      "В сообществе можно будет задавать вопросы, делиться опытом, обсуждать идеи, получать поддержку, находить полезные решения и вдохновляться работами других авторов.",
    ],
    icon: <CommunityIcon />,
  },
  {
    id: "promote",
    title: "Продвижение на АудиоЛаде",
    text: [
      "Лучшие аудиопродукты смогут попадать в подборки, рекомендации, тематические разделы и другие точки знакомства с новой аудиторией.",
    ],
    icon: <PromoteIcon />,
  },
  {
    id: "income",
    title: "Продажи и доход",
    text: [
      "Платные аудиопродукты смогут приносить вам доход, а слушатели – возвращаться к вашим новым практикам и программам.",
    ],
    icon: <IncomeIcon />,
  },
  {
    id: "growth",
    title: "Развитие авторского направления",
    text: [
      "Со временем вы сможете собрать собственную библиотеку аудиопродуктов, расширять линейку, находить новую аудиторию и укреплять своё имя как автора.",
    ],
    icon: <GrowthIcon />,
  },
] as const;

export default function SchoolAfterGraduationScreen() {
  return (
    <section
      className="school-after"
      aria-label="Что вас ждёт после окончания Школы"
    >
      <div className="school-after__header">
        <h2 className="school-after__title">{TITLE}</h2>
        <div className="school-after__intro">
          {INTRO.map((paragraph) => (
            <p key={paragraph} className="school-after__intro-text">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <ol className="school-after__path" aria-label="Путь автора после Школы">
        {PATH.map((step, index) => (
          <li key={step} className="school-after__path-item">
            {index > 0 ? (
              <span className="school-after__path-connector" aria-hidden="true" />
            ) : null}
            <span className="school-after__path-dot" aria-hidden="true" />
            <span className="school-after__path-label">{step}</span>
          </li>
        ))}
      </ol>

      <ul className="school-after__features">
        {FEATURES.map((feature) => (
          <li key={feature.id} className="school-after__feature">
            <span className="school-after__feature-icon" aria-hidden="true">
              {feature.icon}
            </span>
            <div className="school-after__feature-body">
              <h3 className="school-after__feature-title">{feature.title}</h3>
              <div className="school-after__feature-copy">
                {feature.text.map((paragraph) => (
                  <p key={paragraph} className="school-after__feature-text">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="school-after__platform">
        <span className="school-after__platform-mark" aria-hidden="true">
          <LotusMark className="school-after__lotus" />
        </span>
        <h3 className="school-after__platform-title">{PLATFORM_TITLE}</h3>
        <div className="school-after__platform-copy">
          {PLATFORM_TEXT.map((paragraph) => (
            <p key={paragraph} className="school-after__platform-text">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <p className="school-after__accent">{FINAL_ACCENT}</p>

      <SchoolTariffsAnchorLink className="school-after__cta">
        {CTA_LABEL}
      </SchoolTariffsAnchorLink>
    </section>
  );
}
