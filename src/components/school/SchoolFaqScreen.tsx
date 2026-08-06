import Image from "next/image";

import SchoolFaqAccordion from "@/components/school/SchoolFaqAccordion";
import { SCHOOL_FAQ_ITEMS } from "@/lib/school/faq";

const TITLE = "Часто задаваемые вопросы";

const INTRO =
  "Здесь собраны ответы на основные вопросы о программе, формате обучения и участии в Школе Аудиопрактик.";

const CLOSING_TITLE = "Остались вопросы?";

const CLOSING_SUBTITLE =
  "Напишите Сергею – он поможет понять, какой формат участия подойдёт именно вам.";

/** Confirmed personal messenger links for Sergey Petrov. */
const SERGEY_MAX_URL =
  "https://max.ru/u/f9LHodD0cOI9Z0TpTY6vON-AsaLO2UKjrEHxKZb8SoKf46sX5Bvih-n5QjQ";
const SERGEY_TELEGRAM_URL = "https://t.me/petrovss";

type MessengerContact = {
  id: "max" | "telegram";
  label: string;
  href: string;
  iconSrc: string;
  iconAlt: string;
};

const MESSENGER_CONTACTS: MessengerContact[] = [
  {
    id: "max",
    label: "Написать в MAX",
    href: SERGEY_MAX_URL,
    iconSrc: "/school/messengers/max.png",
    iconAlt: "",
  },
  {
    id: "telegram",
    label: "Написать в Telegram",
    href: SERGEY_TELEGRAM_URL,
    iconSrc: "/school/messengers/telegram.png",
    iconAlt: "",
  },
];

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
                  <Image
                    className="school-faq__messenger-logo"
                    src={contact.iconSrc}
                    alt=""
                    width={28}
                    height={28}
                    aria-hidden="true"
                  />
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
