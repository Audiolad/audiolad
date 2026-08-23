import Link from "next/link";

import ArticleFaqList from "@/components/articles/ArticleFaqList";
import {
  articleBodyClass,
  articleBodyStackClass,
} from "@/components/articles/typography";
import ListenSignupCta from "@/components/listens/ListenSignupCta";
import PublicPlaylistEmbed from "@/components/playlists/PublicPlaylistEmbed";
import JsonLdScript from "@/components/seo/JsonLdScript";
import {
  buildListenPageJsonLdGraph,
  resolveListenEditorialTopic,
} from "@/lib/seo/listens";
import type {
  ListenInlineSegment,
  ListenPageData,
  ListenSection,
} from "@/lib/seo/listens/types";

type ListenPageViewProps = {
  data: ListenPageData;
  isAuthenticated?: boolean;
};

const linkClassName =
  "font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

function renderInlineSegments(segments: readonly ListenInlineSegment[]) {
  return segments.map((segment, index) => {
    if ("text" in segment) {
      return <span key={`text-${index}`}>{segment.text}</span>;
    }

    if ("strong" in segment) {
      return <strong key={`strong-${index}`}>{segment.strong}</strong>;
    }

    return (
      <Link
        key={`${segment.href}:${segment.label}:${index}`}
        href={segment.href}
        className={linkClassName}
      >
        {segment.label}
      </Link>
    );
  });
}

function ListenSectionContent({ section }: { section: ListenSection }) {
  if (section.blocks) {
    return (
      <div className="mt-4">
        {section.blocks.map((block, index) => {
          const key = `${block.kind}-${index}`;

          switch (block.kind) {
            case "paragraph":
              return (
                <p
                  key={key}
                  className={index === 0 ? articleBodyClass : `mt-4 ${articleBodyClass}`}
                >
                  {block.text}
                </p>
              );
            case "rich_paragraph":
              return (
                <p
                  key={key}
                  className={index === 0 ? articleBodyClass : `mt-4 ${articleBodyClass}`}
                >
                  {renderInlineSegments(block.segments)}
                </p>
              );
            case "heading":
              return (
                <h3
                  key={key}
                  className="mt-6 text-lg font-semibold text-[#25135c] sm:text-xl"
                >
                  {block.title}
                </h3>
              );
            case "list":
              return (
                <ul key={key} className="mt-4 list-disc space-y-2 pl-5">
                  {block.items.map((item) => (
                    <li key={item.slice(0, 48)}>{item}</li>
                  ))}
                </ul>
              );
            default:
              return null;
          }
        })}
      </div>
    );
  }

  return (
    <div className={`mt-4 ${articleBodyStackClass}`}>
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 64)}>{paragraph}</p>
      ))}
    </div>
  );
}

export default function ListenPageView({
  data,
  isAuthenticated = false,
}: ListenPageViewProps) {
  const { definition } = data;
  const jsonLd = buildListenPageJsonLdGraph(data);
  const topicLink = resolveListenEditorialTopic(definition);

  return (
    <>
      <JsonLdScript data={jsonLd} />
      <article className="mx-auto max-w-[40rem] min-w-0 overflow-x-hidden pb-10 pt-3 xl:pt-2">
        <nav
          aria-label="Хлебные крошки"
          className="text-[13px] leading-5 text-[#7d70a2] sm:text-sm sm:leading-6"
        >
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            <li>
              <Link href="/" className={linkClassName}>
                Главная
              </Link>
            </li>
            <li aria-hidden="true">→</li>
            <li className="text-[#25135c]" aria-current="page">
              {definition.h1}
            </li>
          </ol>
        </nav>

        <header className="mt-3 sm:mt-5">
          <h1 className="text-[1.5rem] font-semibold leading-[1.2] tracking-tight text-[#25135c] min-[360px]:text-[1.625rem] sm:text-[1.75rem] sm:leading-tight md:text-[2rem]">
            {definition.h1}
          </h1>
          {topicLink ? (
            <p className="mt-3 text-sm leading-6 text-[#5c4f82] sm:text-[15px]">
              Тема:{" "}
              <Link href={topicLink.href} className={linkClassName}>
                {topicLink.title}
              </Link>
            </p>
          ) : null}
        </header>

        {definition.intro.length > 0 ? (
          <div className={`mt-4 sm:mt-5 ${articleBodyStackClass}`}>
            {definition.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 64)}>{paragraph}</p>
            ))}
          </div>
        ) : null}

        <div className="mt-5 sm:mt-6">
          <PublicPlaylistEmbed
            playlist={data.playlist}
            sourcePath={data.path}
            navigationPolicy="stay_on_source"
          />
        </div>

        {definition.sections.map((section) => (
          <section key={section.id} className="mt-8 sm:mt-10">
            <h2 className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl">
              {section.title}
            </h2>
            <ListenSectionContent section={section} />
          </section>
        ))}

        {definition.internalLinks && definition.internalLinks.length > 0 ? (
          <section className="mt-8 sm:mt-10">
            <h2 className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl">
              Смотрите также
            </h2>
            <ul className="mt-4 space-y-3">
              {definition.internalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClassName}>
                    {link.title}
                  </Link>
                  {link.description ? (
                    <p className="mt-1 text-sm leading-6 text-[#5c4f82]">
                      {link.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {definition.cta ? (
          <section className="mt-8 rounded-[22px] border border-[#eadff8] bg-white px-4 py-4">
            {definition.cta.text ? (
              <p className={articleBodyClass}>{definition.cta.text}</p>
            ) : null}
            <Link
              href={definition.cta.href}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white"
            >
              {definition.cta.label}
            </Link>
          </section>
        ) : null}

        {definition.faq.length > 0 ? (
          <section className="mt-8 sm:mt-10">
            <h2 className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl">
              Частые вопросы
            </h2>
            <ArticleFaqList items={definition.faq} />
          </section>
        ) : null}

        {!isAuthenticated ? <ListenSignupCta /> : null}
      </article>
    </>
  );
}
