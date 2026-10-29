import Image from "next/image";

import { expertQuote, getCoffeeExpert } from "@/lib/business/vertical-guides/experts";
import type { GuideExpertSlot } from "@/lib/business/vertical-guides/types";

import { GuideParagraphs } from "./GuideSections";

/**
 * One expert block: real portrait (required, the registry rejects experts without one),
 * name and role, the editor's heading, a plain-text source line, the lead, the verbatim
 * quote (a foreign quote is shown only as a Russian translation with a «Перевод с
 * английского» note; the original stays in the registry, never on the page) and the
 * editor's explanation. Everything printed is Russian. No outgoing links.
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
          <Image
            className="guide-expert__photo"
            src={expert.photo.file}
            alt={`${expert.name}, портрет`}
            width={64}
            height={64}
          />
          <div>
            <p className="guide-expert__name">{expert.name}</p>
            <p className="guide-expert__role">{expert.role}</p>
            <p className="guide-expert__credit">{expert.photo.credit}</p>
          </div>
        </div>
        <h3 id={headingId} className="guide-display guide-expert__heading">
          {slot.heading}
        </h3>
        <p className="guide-expert__source">Источник: {quote.sourceLabel ?? quote.sourceTitle}</p>
        <div className="guide-prose">
          <GuideParagraphs paragraphs={slot.lead} keyPrefix={`${expert.id}-lead`} />
        </div>
        <blockquote className="guide-expert__quote" lang="ru">
          <p>{translated ? slot.translation : quote.text}</p>
        </blockquote>
        {translated ? <p className="guide-expert__translation-note">Перевод с английского</p> : null}
        <div className="guide-prose">
          <GuideParagraphs paragraphs={slot.after} keyPrefix={`${expert.id}-after`} />
        </div>
      </div>
    </section>
  );
}
