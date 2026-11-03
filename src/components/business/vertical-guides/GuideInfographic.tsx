import type { GuideInfographic as GuideInfographicData } from "@/lib/business/vertical-guides/types";

/**
 * Simple schematic infographic (3–5 nodes) shown right after the direct answer.
 * Pure HTML/CSS in the guide palette, so every label stays real text: readable on a 360 px
 * phone (nodes stack vertically), searchable, and spoken by screen readers. `description`
 * is the text equivalent of the whole scheme. One component for every article; an article
 * only supplies data (`kind`, nodes, caption).
 *
 * - `steps`: an ordered sequence, numbered nodes joined by arrows.
 * - `structure`: a whole (`center`) and the parts it consists of.
 * - `comparison`: options side by side on the same criteria.
 */
export default function GuideInfographic({ infographic }: { infographic: GuideInfographicData }) {
  const { id, kind, title, center, nodes, description, caption } = infographic;
  const List = kind === "steps" ? "ol" : "ul";
  return (
    <figure
      className={`guide-wrap guide-block guide-infographic guide-infographic--${kind}`}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      data-guide-infographic={kind}
    >
      <div className="guide-infographic__card">
        <p id={`${id}-title`} className="guide-infographic__title guide-display">
          {title}
        </p>
        <p id={`${id}-desc`} className="guide-sr">
          {description}
        </p>
        {kind === "structure" && center && (
          <p className="guide-infographic__center">
            {center}
          </p>
        )}
        <List className="guide-infographic__nodes" data-count={nodes.length}>
          {nodes.map((node, index) => (
            <li key={node.title} className="guide-infographic__node">
              {kind === "steps" && (
                <span className="guide-infographic__num" aria-hidden="true">
                  {index + 1}
                </span>
              )}
              <span className="guide-infographic__label">{node.title}</span>
              <span className="guide-infographic__text">{node.text}</span>
            </li>
          ))}
        </List>
      </div>
      <figcaption className="guide-infographic__caption">{caption}</figcaption>
    </figure>
  );
}
