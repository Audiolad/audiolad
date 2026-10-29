import type { GuideSteps as GuideStepsData } from "@/lib/business/vertical-guides/types";

export default function GuideSteps({ steps }: { steps: GuideStepsData }) {
  return (
    <section className="guide-wrap guide-block guide-prose" aria-labelledby={steps.id}>
      <h2 id={steps.id} className="guide-display guide-h2">
        {steps.heading}
      </h2>
      <p>{steps.intro}</p>
      <ol className="guide-steps">
        {steps.items.map((step, index) => (
          <li key={step.title} className="guide-steps__item">
            <span className="guide-steps__num" aria-hidden="true">
              {index + 1}
            </span>
            <h3 className="guide-steps__title">{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
