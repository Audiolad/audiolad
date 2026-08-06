import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";
import { SCHOOL_START_LABEL } from "@/lib/school/start";
import Image from "next/image";

/**
 * Cover CTA: school-specific phrasing converts better on the first screen
 * than the generic tariff CTAs «Выбрать Стандарт / Премиум / VIP».
 */
const SCHOOL_COVER_CTA = "Присоединиться к Школе";

export default function SchoolFirstScreen() {
  return (
    <div className="school-first-screen">
      <div className="school-first-screen__hero-stage">
        <div className="school-first-screen__hero">
          <Image
            src="/school/hero-school-mobile.webp"
            alt="Женщина записывает голос на телефон дома — для создания аудиопродукта достаточно телефона"
            fill
            className="school-first-screen__hero-image"
            sizes="(max-width: 430px) 100vw, (max-width: 900px) 90vw, 860px"
            priority
          />
          <div className="school-first-screen__hero-fade" aria-hidden="true" />
        </div>
      </div>

      <div className="school-first-screen__content">
        <h1 className="school-first-screen__title">
          Школа
          <br />
          Аудиопрактик
        </h1>

        <p className="school-first-screen__offer">
          Превратите свои знания, голос и внутреннее состояние в авторские
          аудиопродукты, чтобы раскрыть своё предназначение, помогать людям и
          зарабатывать на любимом деле
        </p>

        <p className="school-first-screen__start">
          <span>{SCHOOL_START_LABEL}</span>
        </p>

        <SchoolTariffsAnchorLink className="school-first-screen__cta">
          {SCHOOL_COVER_CTA}
        </SchoolTariffsAnchorLink>
      </div>
    </div>
  );
}
