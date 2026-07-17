import Link from "next/link";

import {
  shouldWrapHomeTopicChip,
  splitHomeTopicsIntoScrollRows,
  type HomeTopicItem,
} from "@/lib/home/topic-navigation";

import HomeSectionHeader from "./HomeSectionHeader";

type HomeTopicNavigationProps = {
  topics: HomeTopicItem[];
};

function TopicChip({ title, href }: Pick<HomeTopicItem, "title" | "href">) {
  const wrapClass = shouldWrapHomeTopicChip(title) ? " home-need-chip--wrap" : "";

  return (
    <Link href={href} className={`home-need-chip${wrapClass}`}>
      {title}
    </Link>
  );
}

export default function HomeTopicNavigation({ topics }: HomeTopicNavigationProps) {
  if (topics.length === 0) {
    return null;
  }

  const { firstRow, secondRow } = splitHomeTopicsIntoScrollRows(topics);

  return (
    <section className="home-needs-strip home-section-carousel mt-8 xl:mt-8">
      <HomeSectionHeader title="Выберите, что вам сейчас нужно" href="/catalog" />

      <nav className="home-needs-track mt-3.5 xl:mt-4" aria-label="Темы АудиоЛад">
        <div className="home-needs-rows">
          <div className="home-needs-row">
            {firstRow.map((topic) => (
              <TopicChip key={topic.key} title={topic.title} href={topic.href} />
            ))}
          </div>

          {secondRow.length > 0 ? (
            <div className="home-needs-row">
              {secondRow.map((topic) => (
                <TopicChip key={topic.key} title={topic.title} href={topic.href} />
              ))}
            </div>
          ) : null}
        </div>
      </nav>
    </section>
  );
}
