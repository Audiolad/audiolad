"use client";

import { useId, useState } from "react";

import type { SchoolFaqItem } from "@/lib/school/faq";
import {
  SCHOOL_START_DAY,
  SCHOOL_START_MONTH,
  SCHOOL_START_YEAR,
} from "@/lib/school/start";

type SchoolFaqAccordionProps = {
  items: readonly SchoolFaqItem[];
};

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SchoolFaqAccordion({ items }: SchoolFaqAccordionProps) {
  const baseId = useId();
  const [openId, setOpenId] = useState<string | null>(null);

  function toggle(id: string) {
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <div className="school-faq__list">
      {items.map((item) => {
        const panelId = `${baseId}-${item.id}-panel`;
        const headerId = `${baseId}-${item.id}-header`;
        const isOpen = openId === item.id;

        return (
          <div key={item.id} className="school-faq__item">
            <h3 className="school-faq__heading">
              <button
                type="button"
                id={headerId}
                className="school-faq__trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
              >
                <span className="school-faq__question">{item.question}</span>
                <span
                  className={
                    isOpen
                      ? "school-faq__chevron school-faq__chevron--open"
                      : "school-faq__chevron"
                  }
                  aria-hidden="true"
                >
                  <ChevronIcon className="school-faq__chevron-icon" />
                </span>
              </button>
            </h3>

            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              hidden={!isOpen}
              className="school-faq__panel"
            >
              {item.id === "start-date" ? (
                <p className="school-faq__answer">
                  Старт первого потока –{" "}
                  <span className="school-number">{SCHOOL_START_DAY}</span>{" "}
                  {SCHOOL_START_MONTH}{" "}
                  <span className="school-number">{SCHOOL_START_YEAR}</span>{" "}
                  года.
                </p>
              ) : (
                item.answer.map((paragraph) => (
                  <p key={paragraph} className="school-faq__answer">
                    {paragraph}
                  </p>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
