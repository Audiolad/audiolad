import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";
import {
  SCHOOL_START_DAY,
  SCHOOL_START_MONTH,
  SCHOOL_START_YEAR,
} from "@/lib/school/start";

const TITLE = "Школа Аудиопрактик";

const LEAD =
  "Ваши знания, голос и внутреннее состояние уже могут стать основой авторских аудиопродуктов, которые будут помогать людям и развивать ваше собственное направление.";

const SUPPORT =
  "Не откладывайте идею, которая может изменить и вашу жизнь, и жизнь ваших будущих слушателей.";

const CTA_LABEL = "Присоединиться к Школе";

const AUTHOR_NAME = "Сергей Петров";

const AUTHOR_ROLE = "Автор и преподаватель Школы Аудиопрактик";

const CLOSING = "До встречи в Школе.";

function SoftWaves() {
  return (
    <svg
      className="school-final__waves"
      viewBox="0 0 320 120"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 62c28-22 52-22 80 0s52 22 80 0 52-22 80 0 52 22 72 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20 78c26-18 48-18 74 0s48 18 74 0 48-18 74 0 48 18 58 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.72"
      />
      <path
        d="M36 46c24-16 44-16 68 0s44 16 68 0 44-16 68 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="248" cy="38" r="26" stroke="currentColor" strokeWidth="1.2" opacity="0.28" />
      <circle cx="248" cy="38" r="40" stroke="currentColor" strokeWidth="1.1" opacity="0.18" />
      <circle cx="248" cy="38" r="54" stroke="currentColor" strokeWidth="1" opacity="0.12" />
    </svg>
  );
}

export default function SchoolFinalScreen() {
  return (
    <section className="school-final" aria-label="Завершение лендинга Школы">
      <div className="school-final__glow" aria-hidden="true" />
      <div className="school-final__decor" aria-hidden="true">
        <SoftWaves />
      </div>

      <div className="school-final__content">
        <h2 className="school-final__title">{TITLE}</h2>
        <p className="school-final__lead">{LEAD}</p>
        <p className="school-final__support">{SUPPORT}</p>

        <p className="school-final__start">
          Старт – <span className="school-number">{SCHOOL_START_DAY}</span>{" "}
          {SCHOOL_START_MONTH}{" "}
          <span className="school-number">{SCHOOL_START_YEAR}</span> года
        </p>

        <SchoolTariffsAnchorLink className="school-final__cta">
          {CTA_LABEL}
        </SchoolTariffsAnchorLink>

        <div className="school-final__author">
          <p className="school-final__author-name">{AUTHOR_NAME}</p>
          <p className="school-final__author-role">{AUTHOR_ROLE}</p>
        </div>

        <p className="school-final__closing">{CLOSING}</p>
      </div>
    </section>
  );
}
