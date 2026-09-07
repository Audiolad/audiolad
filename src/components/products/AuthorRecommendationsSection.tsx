import RelatedProductLinkCard from "@/components/products/RelatedProductLinkCard";
import type { PublicPracticeSeoContent } from "@/lib/products/practice-seo-content";

type AuthorRecommendationsSectionProps = {
  content: Pick<
    PublicPracticeSeoContent,
    "relatedProducts" | "authorRecommendationsTitle"
  >;
  className?: string;
};

export default function AuthorRecommendationsSection({
  content,
  className = "",
}: AuthorRecommendationsSectionProps) {
  if (!content.relatedProducts.length) {
    return null;
  }

  return (
    <section
      data-practice-section="author-recommendations"
      className={`overflow-hidden rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)] sm:p-6 ${className}`.trim()}
    >
      <h2 className="text-lg font-semibold text-[#2b2140]">
        {content.authorRecommendationsTitle}
      </h2>
      <ul className="mt-3 grid w-full max-w-full grid-cols-1 gap-2">
        {content.relatedProducts.map((item) => (
          <li key={item.practiceId} className="min-w-0">
            <RelatedProductLinkCard product={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
