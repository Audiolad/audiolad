import type { GuideParagraph, GuideSection } from "@/lib/business/vertical-guides/types";

import { GuideRichText } from "./GuideRichText";

export function GuideParagraphs({ paragraphs, keyPrefix }: { paragraphs: readonly GuideParagraph[]; keyPrefix: string }) {
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={`${keyPrefix}-${index}`}>
          <GuideRichText parts={paragraph} />
        </p>
      ))}
    </>
  );
}

/** A run of text sections (H2 + paragraphs, optional H3 subsections). */
export default function GuideSections({ sections }: { sections: readonly GuideSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} className="guide-wrap guide-block guide-prose" aria-labelledby={section.id}>
          <h2 id={section.id} className="guide-display guide-h2">
            {section.heading}
          </h2>
          <GuideParagraphs paragraphs={section.paragraphs} keyPrefix={section.id} />
          {section.subsections?.map((subsection) => (
            <div key={subsection.heading}>
              <h3 className="guide-display guide-h3">{subsection.heading}</h3>
              <GuideParagraphs paragraphs={subsection.paragraphs} keyPrefix={subsection.heading} />
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
