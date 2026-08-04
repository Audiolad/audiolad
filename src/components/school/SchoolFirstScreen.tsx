import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";
import Image from "next/image";

/** En dash (U+2013): «Старт – 20 августа». */
const SCHOOL_START_DATE = "Старт – 20 августа";

export default function SchoolFirstScreen() {
  return (
    <div className="school-first-screen">
      <div className="school-first-screen__hero-stage">
        <div className="school-first-screen__hero">
          <Image
            src="/school/hero-school-mobile.webp"
            alt="Женщина записывает голос на телефон дома — для создания аудиопродукта достаточно телефона"
            width={946}
            height={816}
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
          Превратите свои{" "}
          <span className="school-first-screen__offer-em">
            знания, голос и внутреннее состояние в авторские аудиопродукты
          </span>
          , чтобы раскрыть своё предназначение, помогать людям и зарабатывать на
          любимом деле
        </p>

        <p className="school-first-screen__start">{SCHOOL_START_DATE}</p>

        <SchoolTariffsAnchorLink className="school-first-screen__cta">
          Присоединиться к Школе
        </SchoolTariffsAnchorLink>
      </div>
    </div>
  );
}
