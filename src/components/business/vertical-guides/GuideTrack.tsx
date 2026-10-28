"use client";

import Link from "next/link";

import { PlayIcon } from "@/components/home/HomeIcons";
import HomeProductPlayButton from "@/components/home/HomeProductPlayButton";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { CoffeeAtlasTrack } from "@/lib/business/coffee-atlas/music";

type GuideTrackProps = {
  track: CoffeeAtlasTrack | null;
  trackPagePath: string;
};

export default function GuideTrack({ track, trackPagePath }: GuideTrackProps) {
  if (!track) {
    return (
      <p className="guide-player__empty" data-guide-track="empty">
        Пример появится здесь, когда этот трек доступен в каталоге.{" "}
        <Link href={trackPagePath}>Оставить впечатление о треке</Link> можно на его странице.
      </p>
    );
  }

  return (
    <div className="guide-player__row" data-guide-track="live">
      <div className="guide-player__cover">
        <ProductCoverThumbnail
          slug={track.slug}
          title={track.title}
          coverUrl={track.coverUrl}
          coverImage={track.coverImage}
          updatedAt={track.updatedAt}
          authorName={track.authorName}
          format={track.format}
          className="aspect-square w-full rounded-[18px]"
        />
      </div>
      <div className="guide-player__meta">
        <Link href={track.href} className="guide-player__title">
          {track.title}
        </Link>
        {track.authorName ? <p className="guide-player__author">{track.authorName}</p> : null}
        <p className="guide-player__note">
          Трек каталога АудиоЛада. Это пример для прослушивания на сайте, не официальная музыка кофеен из атласа.
        </p>
        <Link href={trackPagePath} className="guide-player__feedback">
          Оставить впечатление о треке
        </Link>
      </div>
      <HomeProductPlayButton
        practiceId={track.id}
        authorSlug={track.authorSlug}
        productSlug={track.slug}
        className="guide-player__play"
      >
        <PlayIcon />
      </HomeProductPlayButton>
    </div>
  );
}
