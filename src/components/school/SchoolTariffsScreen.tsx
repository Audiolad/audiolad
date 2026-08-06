"use client";

import { useRef, useState } from "react";

import SchoolGetCourseModal from "@/components/school/SchoolGetCourseModal";
import type { SchoolGetCourseTariffId } from "@/lib/school/getcourse-widgets";

type SchoolTariffId = SchoolGetCourseTariffId;

type SchoolTariffFeature = {
  text: string;
  note?: string;
};

type SchoolTariff = {
  id: SchoolTariffId;
  name: string;
  ctaLabel: string;
  oldPrice: string;
  price: string;
  description: string;
  features: readonly SchoolTariffFeature[];
  badge?: string;
  tone: "standard" | "premium" | "vip";
};

const TITLE = "Варианты участия";
const SUBTITLE = "Выберите формат обучения, который подходит именно вам.";

const TARIFFS: readonly SchoolTariff[] = [
  {
    id: "standard",
    name: "Стандарт",
    ctaLabel: "Выбрать Стандарт",
    oldPrice: "5 000 ₽",
    price: "1 888 ₽",
    description:
      "Для тех, кто хочет познакомиться с профессией автора аудиопрактик и получить полное представление о том, как создавать собственные аудиопродукты.",
    features: [
      { text: "Два дня живого онлайн-интенсива;" },
      { text: "Все 7 модулей программы;" },
      { text: "Ответы на вопросы во время обучения;" },
      { text: "Записи занятий;" },
      { text: "Первое понимание профессии автора аудиопрактик." },
    ],
    tone: "standard",
  },
  {
    id: "premium",
    name: "Премиум",
    ctaLabel: "Выбрать Премиум",
    oldPrice: "35 000 ₽",
    price: "18 888 ₽",
    badge: "Рекомендуем",
    description:
      "Полная практическая программа Школы Аудиопрактик с месячным сопровождением Сергея Петрова, восемью живыми встречами, персональной обратной связью и помощью в создании, доработке и публикации собственных аудиопродуктов.",
    features: [
      { text: "Всё, что входит в вариант «Стандарт»;" },
      { text: "Бонусный модуль;" },
      { text: "Один месяц практического сопровождения;" },
      {
        text: "8 живых встреч с обратной связью – два раза в неделю;",
        note: "2 раза в неделю",
      },
      { text: "Общий чат участников;" },
      {
        text: "Персональная обратная связь от Сергея Петрова каждому участнику – голосом и в общем чате;",
      },
      { text: "Проверка домашних заданий;" },
      {
        text: "Разбор идей, сценариев, записей, упаковки и готовых аудиопродуктов;",
      },
      { text: "Помощь в создании и доработке первых аудиопродуктов;" },
      {
        text: "Помощь с публикацией первых аудиопродуктов на АудиоЛаде;",
      },
      { text: "Сертификат об окончании Школы Аудиопрактик." },
    ],
    tone: "premium",
  },
  {
    id: "vip",
    name: "VIP",
    ctaLabel: "Выбрать VIP",
    oldPrice: "125 000 ₽",
    price: "88 888 ₽",
    description:
      "Индивидуальная программа для тех, кто хочет максимально быстро создать и развить собственное авторское направление.",
    features: [
      { text: "Всё, что входит в вариант «Премиум»;" },
      { text: "Четыре персональные встречи с Сергеем Петровым;" },
      {
        text: "Индивидуальная помощь в выборе авторского направления;",
      },
      { text: "Совместная разработка линейки аудиопродуктов;" },
      { text: "Помощь в упаковке и позиционировании;" },
      { text: "Помощь с запуском первых продаж;" },
      {
        text: "Помощь с получением коммерческого статуса автора на АудиоЛаде;",
      },
      {
        text: "Создание автоматической воронки в MAX или Telegram для регулярного привлечения новых подписчиков, слушателей и клиентов;",
      },
      {
        text: "Рекомендация (публикация) ваших лучших аудиопродуктов в канале «Сергей и Зоя»;",
      },
      {
        text: "Рекомендация (публикация) ваших лучших аудиопродуктов в рассылках проекта Сергея Петрова;",
      },
      { text: "Индивидуальные рекомендации по развитию вашего проекта." },
    ],
    tone: "vip",
  },
] as const;

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 10.4 8.2 14 15.5 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SchoolTariffsScreen() {
  const [activeTariff, setActiveTariff] =
    useState<SchoolGetCourseTariffId | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <section
      id="tariffs"
      className="school-tariffs"
      aria-label="Варианты участия"
    >
      <div className="school-tariffs__header">
        <h2 className="school-tariffs__title">{TITLE}</h2>
        <p className="school-tariffs__subtitle">{SUBTITLE}</p>
      </div>

      <div className="school-tariffs__grid">
        {TARIFFS.map((tariff) => (
          <article
            key={tariff.id}
            className={`school-tariffs__card school-tariffs__card--${tariff.tone}`}
            data-tariff={tariff.id}
          >
            <div className="school-tariffs__card-top">
              {tariff.badge ? (
                <p className="school-tariffs__badge">{tariff.badge}</p>
              ) : (
                <span
                  className="school-tariffs__badge-spacer"
                  aria-hidden="true"
                />
              )}

              <h3 className="school-tariffs__name">{tariff.name}</h3>

              <div className="school-tariffs__prices">
                <p className="school-tariffs__price-old">
                  <span className="sr-only">Прежняя цена: </span>
                  <span className="school-number">{tariff.oldPrice}</span>
                </p>
                <p className="school-tariffs__price">
                  <span className="sr-only">Текущая цена: </span>
                  <span className="school-number">{tariff.price}</span>
                </p>
              </div>

              <p className="school-tariffs__description">{tariff.description}</p>
            </div>

            <ul className="school-tariffs__features">
              {tariff.features.map((feature) => (
                <li key={feature.text} className="school-tariffs__feature">
                  <span className="school-tariffs__check" aria-hidden="true">
                    <CheckIcon className="school-tariffs__check-icon" />
                  </span>
                  <span className="school-tariffs__feature-body">
                    <span className="school-tariffs__feature-text">
                      {feature.text}
                    </span>
                    {feature.note ? (
                      <span className="school-tariffs__feature-note">
                        {feature.note}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className={
                tariff.tone === "premium"
                  ? "school-tariffs__cta school-tariffs__cta--premium"
                  : "school-tariffs__cta"
              }
              data-tariff={tariff.id}
              aria-label={tariff.ctaLabel}
              aria-haspopup="dialog"
              onClick={(event) => {
                lastTriggerRef.current = event.currentTarget;
                setActiveTariff(tariff.id);
              }}
            >
              {tariff.ctaLabel}
            </button>
          </article>
        ))}
      </div>

      <SchoolGetCourseModal
        tariffId={activeTariff}
        onClose={() => setActiveTariff(null)}
        returnFocusRef={lastTriggerRef}
      />
    </section>
  );
}
