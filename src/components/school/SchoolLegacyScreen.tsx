import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";

const TITLE = "Создайте своё авторское наследие";

const INTRO = [
  "Ваши знания, опыт и голос могут жить намного дольше одной встречи, консультации или обучающей программы.",
  "Записанные вами медитации, аудиопрактики, лекции и аудиокурсы смогут находить новых слушателей, помогать людям, а благодарные ученики и клиенты будут рекомендовать ваши продукты своим друзьям, близким и коллегам.",
  "С каждым годом всё больше людей смогут знакомиться с вашим творчеством, вашим подходом и вашим голосом.",
] as const;

const EMOTION = [
  "Возможно, через десять или двадцать лет кто-то впервые услышит ваш голос.",
  "Получит поддержку.",
  "Найдёт ответ на важный вопрос.",
  "Почувствует внутреннее спокойствие.",
  "И всё это – благодаря аудиопрактике, которую вы создадите сегодня.",
] as const;

const LIST_LEAD =
  "Постепенно вы создадите собственную авторскую библиотеку – наследие, в котором сохранятся:";

const LEGACY_ITEMS = [
  "Ваши знания;",
  "Ваш голос;",
  "Ваше внутреннее состояние;",
  "Ваш жизненный опыт;",
  "Ваш уникальный взгляд на мир;",
  "Всё то, чем вы хотели поделиться с людьми.",
] as const;

const ACCENT =
  "То, что вы создадите сегодня, может помогать людям ещё долгие годы";

const CTA_LABEL = "Выбрать вариант участия";

function SchoolLegacyMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 220 96"
      fill="none"
      aria-hidden="true"
    >
      {/* Soft year circles */}
      <circle
        cx="48"
        cy="48"
        r="34"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.16"
      />
      <circle
        cx="48"
        cy="48"
        r="22"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.28"
      />
      {/* Wave becoming book lines */}
      <path
        d="M92 52c10-14 18-14 28 0s18 14 28 0 18-14 28 0 18 14 22 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M98 64h104M98 72h88M98 80h72"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M188 28c6 4 10 10 10 18 0 14-12 24-26 24h-8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}

export default function SchoolLegacyScreen() {
  return (
    <section
      className="school-legacy-screen"
      aria-label="Создайте своё авторское наследие"
    >
      <div className="school-legacy-screen__glow" aria-hidden="true" />
      <div
        className="school-legacy-screen__orb school-legacy-screen__orb--a"
        aria-hidden="true"
      />
      <div
        className="school-legacy-screen__orb school-legacy-screen__orb--b"
        aria-hidden="true"
      />

      <div className="school-legacy-screen__layout">
        <div className="school-legacy-screen__primary">
          <h2 className="school-legacy-screen__title">{TITLE}</h2>

          <SchoolLegacyMark className="school-legacy-screen__mark" />

          <div className="school-legacy-screen__intro">
            {INTRO.map((paragraph) => (
              <p key={paragraph} className="school-legacy-screen__text">
                {paragraph}
              </p>
            ))}
          </div>

          <ul className="school-legacy-screen__emotion">
            {EMOTION.map((line) => (
              <li key={line} className="school-legacy-screen__emotion-line">
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="school-legacy-screen__secondary">
          <p className="school-legacy-screen__list-lead">{LIST_LEAD}</p>

          <ul className="school-legacy-screen__list">
            {LEGACY_ITEMS.map((item) => (
              <li key={item} className="school-legacy-screen__list-item">
                <span
                  className="school-legacy-screen__list-mark"
                  aria-hidden="true"
                />
                <span className="school-legacy-screen__list-text">{item}</span>
              </li>
            ))}
          </ul>

          <p className="school-legacy-screen__accent">{ACCENT}</p>

          <SchoolTariffsAnchorLink className="school-legacy-screen__cta">
            {CTA_LABEL}
          </SchoolTariffsAnchorLink>
        </div>
      </div>
    </section>
  );
}
