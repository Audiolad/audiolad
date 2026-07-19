import Link from "next/link";

import { buildCatalogTopicHref } from "@/lib/catalog/topic-filter";
import type { TopicWithCatalogCount } from "@/lib/topics/types";

type TopicFilterBarProps = {
  topics: TopicWithCatalogCount[];
  activeTopicKey: string | null;
};

export default function TopicFilterBar({
  topics,
  activeTopicKey,
}: TopicFilterBarProps) {
  const isAllActive = activeTopicKey === null;

  return (
    <nav className="mt-6" aria-label="Фильтр по темам">
      <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href={buildCatalogTopicHref(null)}
          prefetch={false}
          aria-current={isAllActive ? "page" : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
            isAllActive
              ? "border-[#7042c5] bg-[#7042c5] text-white"
              : "border-[#ddcfef] bg-white text-[#7042c5]"
          }`}
        >
          Все
        </Link>

        {topics.map((topic) => {
          const isActive = topic.key === activeTopicKey;

          return (
            <Link
              key={topic.key}
              href={buildCatalogTopicHref(topic.key)}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                isActive
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {topic.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
