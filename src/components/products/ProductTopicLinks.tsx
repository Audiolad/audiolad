import Link from "next/link";

import { buildCatalogTopicHref } from "@/lib/catalog/topic-filter";

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
      className={`${className}`.trim()}
    >
      <p className="mb-2 text-sm font-medium text-[#7d70a2]">Темы</p>
      <ul className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <li key={topic.key}>
            <Link
              href={buildCatalogTopicHref(topic.key)}
              className="inline-flex min-h-11 items-center rounded-full border border-[#e4d7f4] bg-[#faf7ff] px-4 py-2 text-sm font-medium text-[#7042c5] transition hover:border-[#c9b6ea] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              {topic.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
