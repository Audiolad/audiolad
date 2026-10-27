import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { CatalogCard } from "@/lib/catalog/dto";
import { graduateText } from "@/lib/school/graduates";

export default function GraduateProducts({ cards, school = false }: { cards: CatalogCard[]; school?: boolean }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby="graduate-products-heading" className={school ? "mx-auto max-w-6xl px-5 py-12 sm:px-8" : "mt-12 pb-8"}>
      <h2 id="graduate-products-heading" className="text-2xl font-semibold text-[#25135c] sm:text-3xl">Продукты наших выпускников</h2>
      <div role="region" aria-label="Продукты выпускников – прокрутите, чтобы увидеть все" tabIndex={0}
        className="mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7042c5]">
        {cards.map((card) => (
          <a key={card.publication_id} href={school ? `https://audiolad.ru${card.paths.pdp}` : card.paths.pdp}
            className="w-[80%] min-w-0 shrink-0 snap-start overflow-hidden rounded-3xl sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)] border border-[#e8def5] bg-white p-4 text-[#25135c] transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7042c5]">
            <ProductCoverThumbnail slug={card.slug} title={graduateText(card.title)} coverUrl={card.cover.url}
              coverImage={card.cover.image} updatedAt={card.cover.updated_at} authorName={graduateText(card.author.name)}
              className="aspect-square w-full rounded-2xl" displayWidth={360} />
            <h3 className="mt-4 line-clamp-2 break-words text-lg font-semibold">{graduateText(card.title)}</h3>
            <p className="mt-1 line-clamp-2 break-words text-sm text-[#796ba0]">{graduateText(card.author.name)}</p>
            {card.subtitle ? <p className="mt-2 line-clamp-2 break-words text-sm">{graduateText(card.subtitle, 160)}</p> : null}
            {card.duration_seconds != null && card.duration_seconds > 0 ? <p className="mt-3 text-sm text-[#796ba0]">{Math.max(1, Math.ceil(card.duration_seconds / 60))} мин</p> : null}
          </a>
        ))}
      </div>
    </section>
  );
}
