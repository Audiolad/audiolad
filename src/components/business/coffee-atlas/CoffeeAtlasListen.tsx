"use client";

import Link from "next/link";

import HomeProductPlayButton from "@/components/home/HomeProductPlayButton";
import { PlayIcon } from "@/components/home/HomeIcons";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { sendYandexGoal } from "@/lib/analytics/yandex-metrika";
import type { CoffeeAtlasTrack } from "@/lib/business/coffee-atlas/music";

type CoffeeAtlasListenProps = {
  shopName: string;
  tracks: CoffeeAtlasTrack[];
};

/**
 * Music examples of one coffee shop. Every item is a published catalogue
 * track played by the existing global AudioLad player. With no resolved
 * tracks we say so honestly — there is no placeholder playback.
 */
export default function CoffeeAtlasListen({ shopName, tracks }: CoffeeAtlasListenProps) {
  if (tracks.length === 0) {
    return (
      <p className="atlas-listen__empty" data-atlas-listen-state="empty">
        Музыкальный пример для этой кофейни скоро появится в каталоге АудиоЛада.
      </p>
    );
  }

  return (
    <ul
      className="atlas-listen__list"
      data-atlas-listen-state="live"
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("[data-atlas-play]")) {
          sendYandexGoal("business_atlas_listen_clicked");
        }
      }}
    >
      {tracks.map((track) => (
        <li key={track.id} className="atlas-track">
          <div className="atlas-track__cover">
            <ProductCoverThumbnail
              slug={track.slug}
              title={track.title}
              coverUrl={track.coverUrl}
              coverImage={track.coverImage}
              updatedAt={track.updatedAt}
              authorName={track.authorName}
              format={track.format}
              className="aspect-square w-full rounded-[16px]"
            />
          </div>
          <div className="atlas-track__meta">
            {track.label ? <span className="atlas-track__label">{track.label}</span> : null}
            <Link href={track.href} className="atlas-track__title">
              {track.title}
            </Link>
            {track.authorName ? (
              <span className="atlas-track__author">{track.authorName}</span>
            ) : null}
          </div>
          {/* The button keeps the player's own dynamic label («Слушать» / «Пауза»). */}
          <span
            data-atlas-play="true"
            className="atlas-track__play-wrap"
            title={`${track.title} – пример для ${shopName}`}
          >
            <HomeProductPlayButton
              practiceId={track.id}
              authorSlug={track.authorSlug}
              productSlug={track.slug}
              className="atlas-track__play"
            >
              <PlayIcon />
            </HomeProductPlayButton>
          </span>
        </li>
      ))}
    </ul>
  );
}
