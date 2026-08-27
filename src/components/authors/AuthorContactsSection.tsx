import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type { AuthorPublicContact } from "@/lib/authors/contacts";

type AuthorContactsSectionProps = {
  contacts: AuthorPublicContact[];
};

function ExternalArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-[#9485b4]"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 7h8v8M8 16 17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AuthorContactsSection({
  contacts,
}: AuthorContactsSectionProps) {
  if (contacts.length === 0) {
    return null;
  }

  return (
    <section className="mt-10" aria-labelledby="author-contacts-heading">
      <h2
        id="author-contacts-heading"
        className="text-[22px] font-semibold xl:text-[24px]"
      >
        Контакты автора
      </h2>

      <ul className="mt-4 space-y-3">
        {contacts.map((contact) => (
          <li key={`${contact.platform}-${contact.url}-${contact.title}`} className="min-w-0">
            <a
              href={contact.url}
              {...(contact.openInNewTab
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="flex w-full min-w-0 max-w-full items-start gap-3 rounded-[16px] border border-[#eadff8] bg-white px-3 py-3 shadow-sm transition-colors hover:border-[#c6afe6] hover:shadow-[0_12px_32px_rgba(91,62,145,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:items-center sm:gap-4 sm:px-4"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#faf6ff] sm:h-16 sm:w-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={contact.iconUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className={`block ${PRODUCT_FORMAT_LINE_CLASS}`}>
                  {contact.platformLabel}
                </span>
                <span className="mt-1 block break-words text-[16px] font-semibold leading-6 text-[#25135c] xl:text-[18px]">
                  {contact.title}
                </span>
                {contact.description ? (
                  <span className="mt-1 block break-words text-sm leading-6 text-[#7d70a2]">
                    {contact.description}
                  </span>
                ) : null}
              </span>

              {contact.openInNewTab ? (
                <span className="mt-1 shrink-0 sm:mt-0">
                  <ExternalArrowIcon />
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
