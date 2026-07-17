"use client";

import { useState } from "react";

import { buildAuthorAvatarAlt } from "@/lib/seo/cover-alt";
import type { AuthorProfileTopic } from "@/lib/authors/profile";

function getAuthorInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed[0].toUpperCase() : "А";
}

type AuthorAboutSectionProps = {
  name: string;
  avatarUrl: string | null;
  fullBio: string | null;
  topics: AuthorProfileTopic[];
};

export default function AuthorAboutSection({
  name,
  avatarUrl,
  fullBio,
  topics,
}: AuthorAboutSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!fullBio && topics.length === 0) {
    return null;
  }

  const paragraphs = fullBio
    ? fullBio.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
    : [];

  const shouldCollapse = paragraphs.join("\n\n").length > 480;

  return (
    <section className="mt-10" aria-labelledby="author-about-heading">
      <h2 id="author-about-heading" className="text-[22px] font-semibold xl:text-[24px]">
        Об авторе
      </h2>

      <div className="mt-4 rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-gradient-to-br from-[#7042c5] to-[#a27bd9] text-xl font-semibold text-white">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={buildAuthorAvatarAlt(name)}
                className="h-full w-full object-cover"
              />
            ) : (
              getAuthorInitial(name)
            )}
          </div>

          <div className="min-w-0 flex-1">
            {paragraphs.length > 0 ? (
              <div
                className={`space-y-3 text-[15px] leading-7 text-[#65577f] ${
                  shouldCollapse && !expanded ? "max-h-40 overflow-hidden" : ""
                }`}
              >
                {paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ) : null}

            {shouldCollapse ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="mt-3 text-sm font-semibold text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                {expanded ? "Свернуть" : "Показать полностью"}
              </button>
            ) : null}

            {topics.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Основные темы автора">
                {topics.map((topic) => (
                  <li key={topic.key}>
                    <span className="inline-flex rounded-full border border-[#ddcfef] bg-[#faf6ff] px-3 py-1 text-xs font-medium text-[#7042c5]">
                      {topic.title}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
