import type { GuideFaqItem } from "@/lib/business/vertical-guides/types";

/** Visible FAQ. The same items feed the FAQPage JSON-LD. */
export default function GuideFaq({ items }: { items: readonly GuideFaqItem[] }) {
  return (
    <section className="guide-wrap guide-block" aria-labelledby="guide-faq-title">
      <h2 id="guide-faq-title" className="guide-display guide-h2">
        Частые вопросы
      </h2>
      <div className="guide-faq">
        {items.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
