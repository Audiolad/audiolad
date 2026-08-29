import Link from "next/link";

import type { PublicPracticeSeoContent } from "@/lib/products/practice-seo-content";

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
    !content.relatedProducts.length &&
    !content.relatedListens.length
  ) {
    return null;
  }

  return (
    <div className="mt-6 space-y-6">
      {content.usageItems.length ? (
        <section className="rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)] sm:p-6">
          <h2 className="text-lg font-semibold text-[#2b2140]">{productKind === "music" ? "Как слушать музыку" : productKind === "practice" ? "Как использовать практику" : "Как использовать"}</h2>
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
      {content.relatedProducts.length || content.relatedListens.length ? (
        <section className="rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)] sm:p-6">
          {content.relatedProducts.length ? <><h2 className="text-lg font-semibold text-[#2b2140]">Связанные продукты</h2>
          <ul className="mt-3 space-y-2">
            {content.relatedProducts.map((item) => (
              <li key={item.href}><Link className="text-[#7042c5] underline-offset-2 hover:underline" href={item.href}>{item.title}</Link></li>
            ))}
          </ul></> : null}
          {content.relatedListens.length ? <><h2 className={content.relatedProducts.length ? "mt-5 text-lg font-semibold text-[#2b2140]" : "text-lg font-semibold text-[#2b2140]"}>Связанные страницы «Слушать»</h2>
          <ul className="mt-3 space-y-2">
            {content.relatedListens.map((item) => (
              <li key={item.href}><Link className="text-[#7042c5] underline-offset-2 hover:underline" href={item.href}>{item.title}</Link></li>
            ))}
          </ul></> : null}
        </section>
      ) : null}
    </div>
  );
}
