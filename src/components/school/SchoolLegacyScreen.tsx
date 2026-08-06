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

function SchoolLegacyIcons({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <span className="school-legacy-screen__icon-badge">
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M8 16.5 20 10l12 6.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11.5 18.2v6.3c0 2.8 3.7 4.5 8.5 4.5s8.5-1.7 8.5-4.5v-6.3"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M32 16.8v8.4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M14.5 22.5h11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
      </span>

      <span className="school-legacy-screen__icon-badge">
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="11.5" cy="14.5" r="2.7" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="28.5" cy="14.5" r="2.7" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M13.2 28.5c1.2-4.2 3.7-6.2 6.8-6.2s5.6 2 6.8 6.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M7.2 27.8c.9-3.1 2.6-4.6 4.8-4.6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M32.8 27.8c-.9-3.1-2.6-4.6-4.8-4.6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>

      <span className="school-legacy-screen__icon-badge">
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M9 11.5h8.2c1.7 0 3 1.3 3 3V29H12c-1.7 0-3-1.3-3-3V11.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M20.2 11.5H28c1.7 0 3 1.3 3 3V26c0 1.7-1.3 3-3 3h-7.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12.2 16h5M12.2 20h5M23.2 16h5M23.2 20h5"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
            opacity="0.65"
          />
        </svg>
      </span>
    </div>
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

          <SchoolLegacyIcons className="school-legacy-screen__icons" />

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
