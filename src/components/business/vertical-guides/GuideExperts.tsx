import Image from "next/image";

import { expertQuote, getCoffeeExpert } from "@/lib/business/vertical-guides/experts";
import type { GuideExpertSlot } from "@/lib/business/vertical-guides/types";

function QuoteBlock({ text, context }: { text: string; context: string }) {
  return (
    <figure className="guide-quote">
      <blockquote>
        <p>«{text}»</p>
      </blockquote>
      <figcaption>{context}</figcaption>
    </figure>
  );
}

export default function GuideExperts({ slots }: { slots: readonly GuideExpertSlot[] }) {
  return (
    <div className="guide-experts" data-coffee-experts="true">
      {slots.map((slot) => {
        const expert = getCoffeeExpert(slot.expertId);
        if (!expert) {
          return null;
        }
        const quote = expertQuote(expert, slot.quoteIndex);
        const second =
          slot.secondQuoteIndex === undefined ? null : expertQuote(expert, slot.secondQuoteIndex);
        return (
          <article key={expert.id} className="guide-expert" data-expert-id={expert.id}>
            <div className="guide-expert__photo">
              <Image
                src={expert.photo.file}
                alt={`Портрет: ${expert.name}`}
                width={640}
                height={800}
                sizes="(min-width: 800px) 220px, 42vw"
              />
            </div>
            <div>
              <p className="guide-kicker">{expert.role}</p>
              <h3 className="guide-display guide-h3">{expert.name}</h3>
              <p className="guide-expert__meta">
                {expert.country}. {expert.competence}
              </p>
              <p>{slot.bridge}</p>
              <QuoteBlock text={quote.text} context={quote.context} />
              {second && slot.secondBridge ? (
                <>
                  <p>{slot.secondBridge}</p>
                  <QuoteBlock text={second.text} context={second.context} />
                </>
              ) : null}
              {slot.translation ? <p className="guide-translation">{slot.translation}</p> : null}
              <p className="guide-expert__credit">{expert.photo.credit}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
