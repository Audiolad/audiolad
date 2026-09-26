"use client";

import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import HomeProductPlayButton from "@/components/home/HomeProductPlayButton";
import { PlayIcon } from "@/components/home/HomeIcons";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { BusinessListenExample } from "@/lib/business/listen-selection";
import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

type BusinessListenRailProps = {
  items: BusinessListenExample[];
};

export default function BusinessListenRail({ items }: BusinessListenRailProps) {
  if (items.length === 0) {
    return (
      <div className="business-fallback" data-business-listen-state="fallback">
        <div className="business-fallback__mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="business-fallback__copy">
          <h3>Музыка уже ждёт вас в каталоге</h3>
          <p>
            На этой странице нет звука-заглушки. Откройте каталог и включите
            опубликованную музыку.
          </p>
          <div className="business-actions">
            <Link href="/catalog" className="business-btn business-btn--primary">
              Открыть каталог
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ul className="business-listen-grid" data-business-listen-state="live">
      {items.map((item) => (
        <li key={item.id}>
          <article className="business-listen-card">
            <div className="business-listen-card__cover">
              <ProductCoverThumbnail
                slug={item.slug}
                title={item.title}
                coverUrl={item.coverUrl}
                coverImage={item.coverImage}
                updatedAt={item.updatedAt}
                authorName={item.authorName}
                format={item.format}
                className="aspect-square w-full rounded-[22px]"
              />
              <HomeProductPlayButton
                practiceId={item.id}
                authorSlug={item.authorSlug}
                productSlug={item.slug}
                ariaLabel={`${PLAY_ACTION_LABEL}: ${item.title}`}
                className="business-play"
              >
                <PlayIcon />
              </HomeProductPlayButton>
            </div>
            <h3>
              <Link href={item.href}>{item.title}</Link>
            </h3>
            {item.authorName ? (
              <AuthorLink
                authorSlug={item.authorSlug}
                authorName={item.authorName}
                className="business-listen-card__author"
              />
            ) : null}
          </article>
        </li>
      ))}
    </ul>
  );
}
