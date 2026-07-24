import Link from "next/link";

import CatalogProductCard from "@/components/products/CatalogProductCard";
import JsonLdScript from "@/components/seo/JsonLdScript";
import TopicHubProductClickTracker from "@/components/topics/TopicHubProductClickTracker";
import TopicHubViewTracker from "@/components/topics/TopicHubViewTracker";
import type { CatalogProduct } from "@/lib/products/catalog";
import { buildTopicHubJsonLdGraph } from "@/lib/seo/topic-hubs";
import type { TopicHubPageData } from "@/lib/seo/topic-hubs";

type TopicHubPageViewProps = {
  data: TopicHubPageData;
};

function ProductSection({
  title,
  products,
  data,
}: {
  title: string;
  products: CatalogProduct[];
  data: TopicHubPageData;
}) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl">
        {title}
      </h2>
      <ul className="mt-4 grid list-none gap-4 p-0 sm:gap-5">
        {products.map((product) => (
          <li key={product.id}>
            <TopicHubProductClickTracker
              topicKey={data.hub.topicKey}
              hubSlug={data.hub.slug}
              practiceId={product.id}
              path={data.path}
            >
              <CatalogProductCard product={product} />
            </TopicHubProductClickTracker>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function TopicHubPageView({ data }: TopicHubPageViewProps) {
  const jsonLd = buildTopicHubJsonLdGraph(data);

  return (
    <>
      <JsonLdScript data={jsonLd} />
      <TopicHubViewTracker
        path={data.path}
        topicKey={data.hub.topicKey}
        hubSlug={data.hub.slug}
        productCount={data.products.length}
      />

      <div className="listener-author-content px-5 pb-10 pt-4 lg:px-10 xl:px-6">
        <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link
                href="/"
                className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Главная
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href="/catalog"
                className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Каталог
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-[#25135c]" aria-current="page">
              {data.hub.title}
            </li>
          </ol>
        </nav>

        <header className="mt-6 max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.08em] text-[#7d70a2]">
            Тематическая подборка
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#25135c] sm:text-4xl">
            {data.hub.title}
          </h1>
          <p className="mt-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
            {data.hub.intro}
          </p>
          {data.platformTopicTitle ? (
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Платформенная тема каталога: {data.platformTopicTitle}. В подборке{" "}
              {data.products.length}{" "}
              {data.products.length === 1
                ? "практика"
                : data.products.length < 5
                  ? "практики"
                  : "практик"}
              .
            </p>
          ) : null}
        </header>

        <div className="mt-6 max-w-3xl space-y-4 text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
          {data.hub.body.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </div>

        {data.products.length === 0 ? (
          <section className="mt-10 rounded-[24px] border border-[#e8def5] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-[#25135c]">
              Практики скоро появятся
            </h2>
            <p className="mt-2 text-[#4a3d73]">
              Сейчас в этой теме ещё нет опубликованных практик в каталоге.
              Загляните в{" "}
              <Link
                href="/catalog"
                className="font-medium text-[#7042c5] underline-offset-2 hover:underline"
              >
                каталог
              </Link>
              .
            </p>
          </section>
        ) : (
          <>
            <ProductSection
              title="Бесплатные практики"
              products={data.freeProducts}
              data={data}
            />
            <ProductSection
              title="Программы и платные практики"
              products={data.paidProducts}
              data={data}
            />
          </>
        )}

        <section className="mt-12 max-w-3xl">
          <h2 className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl">
            Частые вопросы
          </h2>
          <div className="mt-4 space-y-3">
            {data.hub.faq.map((item) => (
              <details
                key={item.question}
                className="group rounded-[20px] border border-[#e8def5] bg-white px-5 py-4 shadow-sm open:shadow-md"
              >
                <summary className="cursor-pointer list-none text-base font-semibold text-[#25135c] marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start justify-between gap-3">
                    {item.question}
                    <span
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[#7042c5] transition group-open:rotate-45"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#4a3d73] sm:text-[15px] sm:leading-7">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12 max-w-3xl">
          <h2 className="text-xl font-semibold tracking-tight text-[#25135c] sm:text-2xl">
            Смотрите также
          </h2>
          <ul className="mt-4 grid list-none gap-3 p-0">
            {data.hub.relatedLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-[20px] border border-[#e8def5] bg-[#faf7ff] px-5 py-4 transition hover:border-[#c9b6ea] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  <span className="text-base font-semibold text-[#7042c5]">
                    {link.title}
                  </span>
                  {link.description ? (
                    <span className="mt-1 block text-sm leading-6 text-[#7d70a2]">
                      {link.description}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
