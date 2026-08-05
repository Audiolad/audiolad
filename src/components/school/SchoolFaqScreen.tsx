import SchoolFaqAccordion from "@/components/school/SchoolFaqAccordion";
import { SCHOOL_FAQ_ITEMS } from "@/lib/school/faq";

const TITLE = "Часто задаваемые вопросы";

const INTRO =
  "Здесь собраны ответы на основные вопросы о программе, формате обучения и участии в Школе Аудиопрактик.";

const CLOSING_TITLE = "Остались вопросы?";

const CLOSING_SUBTITLE =
  "Напишите Сергею – он поможет понять, какой формат участия подойдёт именно вам.";

/** Confirmed MAX link from published Sergey & Zoya promo CTA. */
const SERGEY_MAX_URL = "https://max.ru/id507305817690_bot";

/** Not found in project/DB/public pages — button omitted until confirmed. */
const SERGEY_TELEGRAM_URL: string | null = null;

type MessengerContact = {
  id: "max" | "telegram";
  label: string;
  href: string;
};

const MESSENGER_CONTACTS: MessengerContact[] = [
  {
    id: "max",
    label: "Написать в MAX",
    href: SERGEY_MAX_URL,
  },
  ...(SERGEY_TELEGRAM_URL
    ? [
        {
          id: "telegram" as const,
          label: "Написать в Telegram",
          href: SERGEY_TELEGRAM_URL,
        },
      ]
    : []),
];

function MaxIcon() {
  return (
    <svg
      className="school-faq__messenger-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="5.25"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M7.15 16V8h1.7l2.2 4.55L13.25 8h1.7v8h-1.5v-5.15L11.3 15.3h-.95L8.65 10.85V16h-1.5Zm9.05 0V8H17.7v8h-1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg
      className="school-faq__messenger-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M21.2 4.4 3.7 11.1c-1.2.45-1.18 1.15-.22 1.45l4.5 1.4 1.75 5.35c.23.7.42.96.9.96.47 0 .68-.22 1.05-.58l2.5-2.42 5.2 3.83c.96.53 1.65.25 1.89-.89l3.42-16.1c.35-1.4-.53-2-1.5-1.56Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MessengerIcon({ id }: { id: MessengerContact["id"] }) {
  return id === "max" ? <MaxIcon /> : <TelegramIcon />;
}

export default function SchoolFaqScreen() {
  return (
    <section
      className="school-faq"
      aria-label="Часто задаваемые вопросы"
    >
      <div className="school-faq__inner">
        <div className="school-faq__header">
          <h2 className="school-faq__title">{TITLE}</h2>
          <p className="school-faq__intro">{INTRO}</p>
        </div>

        <SchoolFaqAccordion items={SCHOOL_FAQ_ITEMS} />

        <div className="school-faq__closing">
          <h3 className="school-faq__closing-title">{CLOSING_TITLE}</h3>
          <p className="school-faq__closing-text">{CLOSING_SUBTITLE}</p>

          {MESSENGER_CONTACTS.length > 0 ? (
            <div
              className={
                MESSENGER_CONTACTS.length > 1
                  ? "school-faq__actions school-faq__actions--pair"
                  : "school-faq__actions"
              }
            >
              {MESSENGER_CONTACTS.map((contact) => (
                <a
                  key={contact.id}
                  className={`school-faq__messenger school-faq__messenger--${contact.id}`}
                  href={contact.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessengerIcon id={contact.id} />
                  <span>{contact.label}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
