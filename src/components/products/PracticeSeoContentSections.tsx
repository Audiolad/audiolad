import RelatedProductLinkCard from "@/components/products/RelatedProductLinkCard";
import {
  getPracticeSeoUsageHeading,
  type PublicPracticeSeoContent,
} from "@/lib/products/practice-seo-content";

export default function PracticeSeoContentSections({
  content,
  productKind,
}: {
  content: PublicPracticeSeoContent;
  productKind?: string | null;
}) {
  if (
    !content.usageItems.length &&
    !content.faqItems.length &&
    !content.relatedProducts.length
  ) {
    return null;
  }

  return (
    <div className="mt-6 space-y-6">
      {content.usageItems.length ? (
        <section className="rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)] sm:p-6">
          <h2 className="text-lg font-semibold text-[#2b2140]">{getPracticeSeoUsageHeading(productKind)}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-7 text-[#65577f]">
            {content.usageItems.map((item, index) => <li key={`${index}-${item.content}`}>{item.content}</li>)}
          </ol>
        </section>
      ) : null}
      {content.faqItems.length ? (
        <section className="rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)] sm:p-6">
          <h2 className="text-lg font-semibold text-[#2b2140]">Вопросы и ответы</h2>
          <dl className="mt-3 space-y-4">
            {content.faqItems.map((item, index) => (
              <div key={`${index}-${item.question}`}>
                <dt className="font-medium text-[#2b2140]">{item.question}</dt>
                <dd className="mt-1 whitespace-pre-line text-[15px] leading-7 text-[#65577f]">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {content.relatedProducts.length ? (
        <section className="overflow-hidden rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)] sm:p-6">
          <h2 className="text-lg font-semibold text-[#2b2140]">{content.authorRecommendationsTitle}</h2>
          <ul className="mt-3 grid w-full max-w-full grid-cols-1 gap-2">
            {content.relatedProducts.map((item) => (
              <li key={item.practiceId} className="min-w-0">
                <RelatedProductLinkCard product={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
