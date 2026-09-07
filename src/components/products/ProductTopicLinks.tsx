import Link from "next/link";

import { resolveTopicPublicHref } from "@/lib/seo/topic-hubs";

export type ProductTopicLinkItem = {
  key: string;
  title: string;
};

type ProductTopicLinksProps = {
  topics: ProductTopicLinkItem[];
  className?: string;
};

export default function ProductTopicLinks({
  topics,
  className = "",
}: ProductTopicLinksProps) {
  if (topics.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Темы практики"
      data-practice-section="topics"
      className={`${className}`.trim()}
    >
      <p className="mb-1.5 text-xs font-medium text-[#7d70a2]">Темы</p>
      <ul className="flex flex-row flex-wrap items-center gap-2">
        {topics.map((topic) => (
          <li key={topic.key} className="max-w-full shrink-0">
            <Link
              href={resolveTopicPublicHref(topic.key)}
              className="inline-flex min-h-11 max-w-full items-center whitespace-normal rounded-full border border-[#e4d7f4] bg-[#faf7ff] px-2.5 py-1 text-[10px] font-medium leading-tight text-[#7042c5] transition hover:border-[#c9b6ea] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              {topic.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
