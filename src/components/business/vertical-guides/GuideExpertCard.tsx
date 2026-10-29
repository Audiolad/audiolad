import Image from "next/image";

import { expertInitials, expertQuote, getCoffeeExpert } from "@/lib/business/vertical-guides/experts";
import type { GuideExpertSlot } from "@/lib/business/vertical-guides/types";

import { GuideParagraphs } from "./GuideSections";

/**
 * One expert block: portrait or initials, name and role, the editor's heading,
 * a plain-text source line, the lead, the verbatim quote (or a labelled translation
 * with the original under it) and the editor's explanation. No outgoing links.
 */
export default function GuideExpertCard({ slot }: { slot: GuideExpertSlot }) {
  const expert = getCoffeeExpert(slot.expertId);
  if (!expert) {
    throw new Error(`Unknown coffee expert ${slot.expertId}`);
  }
  const quote = expertQuote(expert, slot.quoteIndex);
  const translated = Boolean(slot.translation);
  const headingId = `expert-${expert.id}`;

  return (
    <section
      className="guide-wrap guide-block"
      aria-labelledby={headingId}
      data-guide-expert={expert.id}
    >
      <div className="guide-expert">
        <div className="guide-expert__person">
          {expert.photo ? (
            <Image
              className="guide-expert__photo"
              src={expert.photo.file}
              alt={`${expert.name}, портрет`}
              width={64}
              height={64}
            />
          ) : (
            <span className="guide-expert__initials" aria-hidden="true">
              {expertInitials(expert.name)}
            </span>
          )}
          <div>
            <p className="guide-expert__name">{expert.name}</p>
            <p className="guide-expert__role">{expert.role}</p>
            {expert.photo ? <p className="guide-expert__credit">{expert.photo.credit}</p> : null}
          </div>
        </div>
        <h3 id={headingId} className="guide-display guide-expert__heading">
          {slot.heading}
        </h3>
        <p className="guide-expert__source">Источник: {quote.sourceLabel ?? quote.sourceTitle}</p>
        <div className="guide-prose">
          <GuideParagraphs paragraphs={slot.lead} keyPrefix={`${expert.id}-lead`} />
        </div>
        <blockquote className="guide-expert__quote" lang={translated ? "ru" : quote.language ?? "ru"}>
          <p>{translated ? slot.translation : quote.text}</p>
        </blockquote>
        {translated ? (
          <p className="guide-expert__original">
            <span className="guide-expert__original-label">Перевод с английского. Оригинал: </span>
            <span lang={quote.language ?? "en"}>{quote.text}</span>
          </p>
        ) : null}
        <div className="guide-prose">
          <GuideParagraphs paragraphs={slot.after} keyPrefix={`${expert.id}-after`} />
        </div>
      </div>
    </section>
  );
}
