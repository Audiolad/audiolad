import Link from "next/link";

import JsonLdScript from "@/components/seo/JsonLdScript";
import {
  buildTopicsDirectoryJsonLdGraph,
  type TopicsDirectoryPageData,
} from "@/lib/seo/topic-hubs";

type TopicsDirectoryPageViewProps = {
  data: TopicsDirectoryPageData;
};

export default function TopicsDirectoryPageView({
  data,
}: TopicsDirectoryPageViewProps) {
  const jsonLd = buildTopicsDirectoryJsonLdGraph(data);

  return (
    <>
      <JsonLdScript data={jsonLd} />

      <div className="pb-10 pt-4">
        <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link
                href="/"
                className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Главная
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-[#25135c]" aria-current="page">
              {data.h1}
            </li>
          </ol>
        </nav>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
            {data.h1}
          </h1>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            {data.intro}
          </p>
        </header>

        <section className="mt-10 max-w-3xl" aria-labelledby="topics-hubs-heading">
          <h2
            id="topics-hubs-heading"
            className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl"
          >
            Подборки
          </h2>
          <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
            {data.hubs.map((hub) => (
              <li key={hub.slug}>
                <Link
                  href={hub.href}
                  className="flex min-h-11 flex-col justify-center rounded-[20px] border border-[#e8def5] bg-white px-5 py-4 transition hover:border-[#c9b6ea] hover:bg-[#faf7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  <span className="text-base font-semibold text-[#7042c5]">
                    {hub.title}
                  </span>
                  <span className="mt-1 line-clamp-3 text-sm leading-6 text-[#4a3d73]">
                    {hub.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
