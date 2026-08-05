import Image from "next/image";

const SECTION_TITLE = "Автор и преподаватель Школы Аудиопрактик";
const NAME = "Сергей Петров";
const ROLE =
  "Продюсер, наставник, энергопрактик, автор образовательных программ и платформы АудиоЛад.";

const INTRO = [
  "Более 20 лет я изучаю, как через голос, внутреннее состояние и авторские практики можно помогать людям проходить жизненные изменения.",
  "За эти годы я убедился, что аудиоформат способен стать одним из самых бережных, доступных и эффективных способов передавать знания, опыт и поддержку.",
  "Именно поэтому появилась Школа Аудиопрактик – место, где каждый человек может превратить свои знания, голос и внутреннее состояние в авторские аудиопродукты.",
] as const;

const EXPERIENCE = [
  { prefix: "В практиках – ", value: "20 лет" },
  { prefix: "Консультирую и преподаю – ", value: "12 лет" },
] as const;

const CONDUCTED = [
  { value: "4385+", label: "консультаций;" },
  { value: "2150+", label: "энергетических сеансов;" },
  { value: "1820+", label: "групповых занятий;" },
] as const;

const CREATED = [
  { value: "28", label: "авторских программ и курсов;" },
  { value: "32", label: "авторских аудиопродукта;" },
  { value: "4", label: "офлайн-тренинга;" },
] as const;

const BOOKS = [
  "«Коучинг – это бизнес. Как процветать, помогая другим»;",
  "«Инфосторителлинг. Как элегантно привлекать клиентов через мини-истории»;",
  "«Целитель нового времени. Как услышать душу и жить в потоке Создателя».",
] as const;

const WHY = [
  "За годы работы я увидел, что огромное количество талантливых психологов, наставников, преподавателей, энергопрактиков и просто людей с богатым жизненным опытом мечтают создавать собственные медитации, аудиопрактики и программы.",
  "Но большинство из них не знают, с чего начать, как превратить свои знания в качественный аудиопродукт, где найти первых слушателей и как выстроить собственное авторское направление.",
  "Именно поэтому мы создали Школу Аудиопрактик – чтобы помочь как можно большему количеству людей раскрыть свой талант, обрести слушателей и создать авторские аудиопродукты, которые будут помогать людям долгие годы.",
] as const;

const WISH = [
  "Я верю, что у каждого человека есть знания, опыт и внутреннее состояние, которыми стоит делиться.",
  "И точно знаю, что вы можете превратить свои знания, голос и жизненный опыт в авторские аудиопродукты, которые позволят раскрыть ваши таланты, будут помогать людям и приносить достойный доход.",
] as const;

const PHOTO_ALT =
  "Сергей Петров — автор и преподаватель Школы Аудиопрактик";

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.5 5.2h7.2c1.5 0 2.7 1.2 2.7 2.7v11.4H8.2c-1.5 0-2.7-1.2-2.7-2.7V5.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M15.4 5.2h3.1v13.4c0 1.2-.9 2.1-2.1 2.1H8.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 8.4h4.4M8.4 11.4h4.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.75 12h16.5M12 3.75c2.4 2.5 3.6 5.2 3.6 8.25S14.4 18 12 20.25C9.6 18 8.4 15.3 8.4 12.25S9.6 6.25 12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SchoolAuthorScreen() {
  return (
    <section
      className="school-author"
      aria-label="Автор и преподаватель Школы Аудиопрактик"
    >
      <div className="school-author__hero">
        <h2 className="school-author__section-title school-author__section-title--mobile">
          {SECTION_TITLE}
        </h2>

        <div className="school-author__photo-wrap">
          <Image
            src="/school/sergey-petrov-school.webp"
            alt={PHOTO_ALT}
            width={960}
            height={1270}
            className="school-author__photo"
            sizes="(max-width: 767px) 100vw, (max-width: 1024px) 42vw, 420px"
            priority={false}
          />
        </div>

        <div className="school-author__intro">
          <h2 className="school-author__section-title school-author__section-title--desktop">
            {SECTION_TITLE}
          </h2>
          <p className="school-author__name">{NAME}</p>
          <p className="school-author__role">{ROLE}</p>
          <div className="school-author__story">
            {INTRO.map((paragraph) => (
              <p key={paragraph} className="school-author__text">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="school-author__experience">
        <h3 className="school-author__subtitle">Мой опыт</h3>

        <div className="school-author__years">
          {EXPERIENCE.map((item) => (
            <p key={item.prefix} className="school-author__year">
              <span className="school-author__year-prefix">{item.prefix}</span>
              <span className="school-author__year-value">{item.value}</span>
              <span aria-hidden="true">;</span>
            </p>
          ))}
        </div>

        <div className="school-author__stats">
          <div className="school-author__stat-block">
            <p className="school-author__stat-lead">За это время я провёл</p>
            <ul className="school-author__stat-list">
              {CONDUCTED.map((item) => (
                <li key={item.label} className="school-author__stat-item">
                  <span className="school-author__stat-value">{item.value}</span>
                  <span className="school-author__stat-label">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="school-author__stat-block">
            <p className="school-author__stat-lead">Создал</p>
            <ul className="school-author__stat-list">
              {CREATED.map((item) => (
                <li key={item.label} className="school-author__stat-item">
                  <span className="school-author__stat-value">{item.value}</span>
                  <span className="school-author__stat-label">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="school-author__mid">
        <div className="school-author__books">
          <h3 className="school-author__subtitle">Автор книг</h3>
          <ul className="school-author__book-list">
            {BOOKS.map((book) => (
              <li key={book} className="school-author__book-item">
                <span className="school-author__book-icon" aria-hidden="true">
                  <BookIcon className="school-author__book-svg" />
                </span>
                <span className="school-author__book-text">{book}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="school-author__geo">
          <h3 className="school-author__subtitle">География</h3>
          <div className="school-author__geo-card">
            <span className="school-author__geo-icon" aria-hidden="true">
              <GlobeIcon className="school-author__geo-svg" />
            </span>
            <p className="school-author__geo-text">
              Сегодня мои клиенты и ученики живут в{" "}
              <strong className="school-author__geo-strong">29 странах</strong>{" "}
              на{" "}
              <strong className="school-author__geo-strong">5 континентах</strong>
              .
            </p>
          </div>
        </div>
      </div>

      <div className="school-author__why">
        <h3 className="school-author__subtitle">
          Почему появилась Школа Аудиопрактик
        </h3>
        <div className="school-author__why-body">
          {WHY.map((paragraph) => (
            <p key={paragraph} className="school-author__text">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <div className="school-author__wish">
        <h3 className="school-author__subtitle">Моё главное желание</h3>
        <div className="school-author__wish-body">
          {WISH.map((paragraph) => (
            <p key={paragraph} className="school-author__wish-text">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
