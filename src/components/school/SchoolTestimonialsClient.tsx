"use client";

import Image from "next/image";
import { useId, useState } from "react";

import {
  isAllowedVkEmbedUrl,
  SCHOOL_TESTIMONIALS,
  SCHOOL_TESTIMONIALS_MOBILE_VISIBLE,
  type SchoolTestimonial,
} from "@/lib/school/testimonials";

function PlayIcon() {
  return (
    <svg
      className="school-stories__play-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8.2 5.8a1.2 1.2 0 0 0-1.85 1.01v10.38A1.2 1.2 0 0 0 8.2 18.2l9.1-5.19a1.2 1.2 0 0 0 0-2.08L8.2 5.8Z" />
    </svg>
  );
}

function DurationIcon() {
  return (
    <svg
      className="school-stories__duration-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.75" y="6.25" width="16.5" height="11.5" rx="2.2" />
      <path d="M10.2 10.1 14.8 12l-4.6 1.9V10.1Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ResultText({
  parts,
}: {
  parts: SchoolTestimonial["result"];
}) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === "number" ? (
          <span key={`${part.value}-${index}`} className="school-number">
            {part.value}
          </span>
        ) : (
          <span key={`${part.value}-${index}`}>{part.value}</span>
        ),
      )}
    </>
  );
}

function StoryCard({
  story,
  isActive,
  onPlay,
}: {
  story: SchoolTestimonial;
  isActive: boolean;
  onPlay: (id: string) => void;
}) {
  const embedSafe = isAllowedVkEmbedUrl(story.embedUrl);

  return (
    <article className="school-stories__card">
      <div className="school-stories__media">
        {isActive && embedSafe ? (
          <iframe
            className="school-stories__iframe"
            src={story.embedUrl}
            title={`Видеоистория ${story.nameGenitive}`}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock"
            allowFullScreen
            frameBorder={0}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            className="school-stories__placeholder"
            onClick={() => {
              if (embedSafe) onPlay(story.id);
            }}
            aria-label={`Воспроизвести видеоисторию ${story.nameGenitive}`}
            disabled={!embedSafe}
          >
            <Image
              className="school-stories__poster"
              src={story.posterSrc}
              alt={story.posterAlt}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 360px"
              style={{
                objectFit: "cover",
                objectPosition: story.posterPosition ?? "center center",
              }}
            />
            <span className="school-stories__shade" aria-hidden="true" />
            <span className="school-stories__play">
              <PlayIcon />
            </span>
            <span className="school-stories__duration">
              <DurationIcon />
              <span className="school-number">{story.duration}</span>
            </span>
          </button>
        )}
      </div>

      <div className="school-stories__body">
        <h3 className="school-stories__name">{story.name}</h3>
        <p className="school-stories__result">
          <ResultText parts={story.result} />
        </p>
        {story.resultNote ? (
          <p className="school-stories__note">{story.resultNote}</p>
        ) : null}
        <a
          className="school-stories__vk-link"
          href={story.vkUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Открыть во ВКонтакте
        </a>
      </div>
    </article>
  );
}

export default function SchoolTestimonialsClient() {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const hiddenIds = new Set(
    SCHOOL_TESTIMONIALS.slice(SCHOOL_TESTIMONIALS_MOBILE_VISIBLE).map(
      (story) => story.id,
    ),
  );

  function handleToggle() {
    setExpanded((current) => {
      const next = !current;
      if (!next && activeVideoId && hiddenIds.has(activeVideoId)) {
        setActiveVideoId(null);
      }
      return next;
    });
  }

  return (
    <>
      <div className="school-stories__grid" id={listId}>
        {SCHOOL_TESTIMONIALS.map((story, index) => {
          const isExtra = index >= SCHOOL_TESTIMONIALS_MOBILE_VISIBLE;
          return (
            <div
              key={story.id}
              className={
                isExtra
                  ? expanded
                    ? "school-stories__item school-stories__item--extra is-open"
                    : "school-stories__item school-stories__item--extra"
                  : "school-stories__item"
              }
            >
              <StoryCard
                story={story}
                isActive={activeVideoId === story.id}
                onPlay={setActiveVideoId}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="school-stories__more"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={handleToggle}
      >
        {expanded ? "Свернуть истории" : "Показать ещё 2 истории"}
      </button>
    </>
  );
}
