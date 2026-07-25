"use client";

import { useId, useState } from "react";

import { articleFaqAnswerClass } from "@/components/articles/typography";
import type { ArticleFaqItem } from "@/lib/seo/articles";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={[
        "h-5 w-5 text-[#7042c5] transition-transform duration-200 motion-reduce:transition-none",
        open ? "rotate-180" : "rotate-0",
      ].join(" ")}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FaqDetailsItem({ item }: { item: ArticleFaqItem }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <details
      className="group rounded-[20px] border border-[#e8def5] bg-white shadow-sm open:shadow-md"
      onToggle={(event) => {
        setOpen((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary
        aria-expanded={open}
        aria-controls={panelId}
        className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-base font-semibold leading-6 text-[#25135c]">
            {item.question}
          </span>
          <span className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[#7042c5]">
            <ChevronIcon open={open} />
          </span>
        </span>
      </summary>
      <div id={panelId} className="px-5 pb-4">
        <p className={articleFaqAnswerClass}>{item.answer}</p>
      </div>
    </details>
  );
}

type ArticleFaqListProps = {
  items: readonly ArticleFaqItem[];
};

export default function ArticleFaqList({ items }: ArticleFaqListProps) {
  return (
    <div className="mt-4 space-y-3">
      {items.map((item) => (
        <FaqDetailsItem key={item.question} item={item} />
      ))}
    </div>
  );
}
