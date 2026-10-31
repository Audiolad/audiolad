import Image from "next/image";

import { expertQuote, getCoffeeExpert } from "@/lib/business/vertical-guides/experts";
import type { GuideExpertSlot } from "@/lib/business/vertical-guides/types";

import { GuideParagraphs } from "./GuideSections";

/**
 * One expert block: real portrait (required, the registry rejects experts without one),
 * name and role, the editor's heading, a plain-text source line, the lead, the verbatim
 * quote (a foreign quote is shown only as a Russian translation with a note in the quote's
 * language: «Перевод с английского», «Перевод с чешского»; the original stays in the registry,
 * never on the page) and the
 * editor's explanation. Everything printed is Russian. No outgoing links.
 */
/** Genitive language names for the «Перевод с …» note (registry `language`). */
const TRANSLATED_FROM: Record<string, string> = { en: "английского", cs: "чешского", it: "итальянского", fr: "французского", de: "немецкого", es: "испанского" };

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
            width={80}
            height={80}
            // Served as the static 600×600 webp, not through /_next/image: on next 16.3.x a
            // client that aborts a cold transform (lazy avatar scrolled past on a phone) wedges
            // that exact url+w+q key until restart (vercel/next.js#96538, fixed in 16.4 by #98168),
            // and the 2x avatar (w=256) came back 504 – an empty circle on mobile.
            unoptimized
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
        {translated ? <p className="guide-expert__translation-note">Перевод с {TRANSLATED_FROM[quote.language ?? "en"] ?? "иностранного"}</p> : null}
        <div className="guide-prose">
          <GuideParagraphs paragraphs={slot.after} keyPrefix={`${expert.id}-after`} />
        </div>
      </div>
    </section>
  );
}
