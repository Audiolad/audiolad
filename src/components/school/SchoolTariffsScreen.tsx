type SchoolTariffId = "standard" | "premium" | "vip";

type SchoolTariff = {
  id: SchoolTariffId;
  name: string;
  price: string;
  description: string;
  features: readonly string[];
  badge?: string;
  tone: "standard" | "premium" | "vip";
};

const TITLE = "Пакеты участия";
const SUBTITLE = "Выберите формат обучения, который подходит именно вам.";
const CTA_LABEL = "Принять участие";

const TARIFFS: readonly SchoolTariff[] = [
  {
    id: "standard",
    name: "Стандарт",
    price: "1 888 ₽",
    description:
      "Для тех, кто хочет познакомиться с профессией автора аудиопрактик и получить полное представление о том, как создавать собственные аудиопродукты.",
    features: [
      "Два дня живого онлайн-интенсива;",
      "Все 7 модулей программы;",
      "Ответы на вопросы во время обучения;",
      "Записи занятий;",
      "Первое понимание профессии автора аудиопрактик.",
    ],
    tone: "standard",
  },
  {
    id: "premium",
    name: "Премиум",
    price: "18 888 ₽",
    badge: "Рекомендуем",
    description:
      "Полная программа Школы Аудиопрактик с групповым сопровождением Сергея Петрова, обратной связью и помощью в создании собственных аудиопродуктов.",
    features: [
      "Всё, что входит в пакет «Стандарт»;",
      "Бонусный модуль;",
      "Один месяц сопровождения;",
      "Общий чат участников;",
      "Проверка домашних заданий;",
      "Обратная связь во время обучения;",
      "Помощь в создании первых аудиопродуктов;",
      "Помощь с публикацией на АудиоЛаде;",
      "Сертификат об окончании Школы Аудиопрактик.",
    ],
    tone: "premium",
  },
  {
    id: "vip",
    name: "VIP",
    price: "88 888 ₽",
    description:
      "Индивидуальная программа для тех, кто хочет максимально быстро создать и развить собственное авторское направление.",
    features: [
      "Всё, что входит в пакет «Премиум»;",
      "Четыре персональные встречи с Сергеем Петровым;",
      "Индивидуальная помощь в выборе авторского направления;",
      "Совместная разработка линейки аудиопродуктов;",
      "Помощь в упаковке и позиционировании;",
      "Помощь с запуском первых продаж;",
      "Помощь с получением коммерческого статуса автора на АудиоЛаде;",
      "Создание автоматической воронки в MAX или Telegram для регулярного привлечения новых подписчиков, слушателей и клиентов;",
      "Рекомендация (публикация) ваших лучших аудиопродуктов в канале «Сергей и Зоя»;",
      "Рекомендация (публикация) ваших лучших аудиопродуктов в рассылках проекта Сергея Петрова;",
      "Индивидуальные рекомендации по развитию вашего проекта.",
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
  return (
    <section
      id="tariffs"
      className="school-tariffs"
      aria-label="Пакеты участия"
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
                <span className="school-tariffs__badge-spacer" aria-hidden="true" />
              )}

              <h3 className="school-tariffs__name">{tariff.name}</h3>
              <p className="school-tariffs__price">{tariff.price}</p>
              <p className="school-tariffs__description">{tariff.description}</p>
            </div>

            <ul className="school-tariffs__features">
              {tariff.features.map((feature) => (
                <li key={feature} className="school-tariffs__feature">
                  <span className="school-tariffs__check" aria-hidden="true">
                    <CheckIcon className="school-tariffs__check-icon" />
                  </span>
                  <span className="school-tariffs__feature-text">{feature}</span>
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
              aria-label={`${CTA_LABEL}: пакет ${tariff.name}`}
            >
              {CTA_LABEL}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
