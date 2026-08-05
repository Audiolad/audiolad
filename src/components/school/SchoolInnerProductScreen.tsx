const TITLE =
  "Возможно, ваш первый авторский аудиопродукт уже живёт внутри вас";

const INTRO = [
  "Чтобы создавать востребованные аудиопродукты, не нужно быть профессиональным диктором или звукорежиссёром.",
  "Гораздо важнее то, что уже есть внутри вас.",
] as const;

const LIST_LEAD = "Возможно, у вас уже есть:";

const ITEMS = [
  { label: "Знания и опыт;", kind: "knowledge" },
  { label: "Тема, которая вас волнует;", kind: "topic" },
  { label: "Собственные медитации или практики;", kind: "practice" },
  { label: "Желание помогать людям;", kind: "care" },
  { label: "Спокойный голос;", kind: "voice" },
  { label: "Жизненная история;", kind: "story" },
  {
    label: "Внутреннее состояние, которым хочется делиться.",
    kind: "state",
  },
] as const;

const CLOSING =
  "Школа Аудиопрактик поможет превратить всё это в авторские аудиопродукты, которые будут помогать людям и станут основой вашего собственного авторского направления.";

type ItemKind = (typeof ITEMS)[number]["kind"];

function ItemIcon({ kind }: { kind: ItemKind }) {
  return (
    <svg
      className="school-inner-product__item-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {kind === "knowledge" && (
        <>
          <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M12 8.2v5.1l3.2 1.7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === "topic" && (
        <path
          d="M7.2 16.8 12 6.5l4.8 10.3M9 13.4h6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === "practice" && (
        <path
          d="M6.5 12c1.6-3.2 3.4-4.8 5.5-4.8S15.9 8.8 17.5 12c-1.6 3.2-3.4 4.8-5.5 4.8S8.1 15.2 6.5 12Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
      {kind === "care" && (
        <path
          d="M12 18.2c-4.8-2.8-7-5.5-7-8.1A3.6 3.6 0 0 1 12 7.4a3.6 3.6 0 0 1 7 2.7c0 2.6-2.2 5.3-7 8.1Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
      {kind === "voice" && (
        <>
          <rect
            x="9.2"
            y="5.5"
            width="5.6"
            height="9"
            rx="2.8"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M7.4 12.4a4.6 4.6 0 0 0 9.2 0M12 17v1.8"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "story" && (
        <path
          d="M6.8 6.5h7.4c1.7 0 3 1.3 3 3v8.2H9.8c-1.7 0-3-1.3-3-3V6.5Zm0 0V17"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === "state" && (
        <>
          <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.4" />
          <circle
            cx="12"
            cy="12"
            r="6.8"
            stroke="currentColor"
            strokeWidth="1.2"
            opacity="0.55"
          />
        </>
      )}
    </svg>
  );
}

function InnerSourceMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="78" stroke="currentColor" strokeWidth="1" opacity="0.12" />
      <circle cx="100" cy="100" r="56" stroke="currentColor" strokeWidth="1.15" opacity="0.2" />
      <circle cx="100" cy="100" r="36" stroke="currentColor" strokeWidth="1.3" opacity="0.32" />
      <circle cx="100" cy="100" r="18" fill="currentColor" opacity="0.14" />
      <circle cx="100" cy="100" r="8" fill="currentColor" opacity="0.28" />
      <path
        d="M48 108c10-8 18-8 28 0s18 8 28 0 18-8 28 0 18 8 20 4"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M56 88c8-6 14-6 22 0s14 6 22 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.22"
      />
    </svg>
  );
}

export default function SchoolInnerProductScreen() {
  return (
    <section
      className="school-inner-product"
      aria-label="Возможно, ваш первый авторский аудиопродукт уже живёт внутри вас"
    >
      <div className="school-inner-product__glow" aria-hidden="true" />
      <div
        className="school-inner-product__orb school-inner-product__orb--a"
        aria-hidden="true"
      />
      <div
        className="school-inner-product__orb school-inner-product__orb--b"
        aria-hidden="true"
      />

      <div className="school-inner-product__layout">
        <div className="school-inner-product__primary">
          <h2 className="school-inner-product__title">{TITLE}</h2>

          <InnerSourceMark className="school-inner-product__mark school-inner-product__mark--mobile" />

          <div className="school-inner-product__intro">
            {INTRO.map((paragraph) => (
              <p key={paragraph} className="school-inner-product__text">
                {paragraph}
              </p>
            ))}
          </div>

          <p className="school-inner-product__closing school-inner-product__closing--desktop">
            {CLOSING}
          </p>
        </div>

        <div className="school-inner-product__secondary">
          <InnerSourceMark className="school-inner-product__mark school-inner-product__mark--desktop" />

          <p className="school-inner-product__list-lead">{LIST_LEAD}</p>

          <ul className="school-inner-product__list">
            {ITEMS.map((item) => (
              <li key={item.label} className="school-inner-product__item">
                <span className="school-inner-product__item-mark" aria-hidden="true">
                  <ItemIcon kind={item.kind} />
                </span>
                <span className="school-inner-product__item-text">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="school-inner-product__closing school-inner-product__closing--mobile">
          {CLOSING}
        </p>
      </div>
    </section>
  );
}
