import {
  AuthorBannerImage,
  AvatarImage,
} from "@/components/images/ResponsiveImage";
import { formatBannerObjectPosition } from "@/lib/authors/banner-position";
import {
  AUTHOR_DEFAULT_AVATAR_PATH,
  AUTHOR_DEFAULT_BANNER_PATH,
  resolveAuthorPositioningText,
} from "@/lib/authors/brand-assets";
import { buildAuthorAvatarAlt } from "@/lib/seo/cover-alt";
import { parseImageManifest } from "@/lib/images/image-manifest";
import type { ImageManifest } from "@/lib/images/image-types";

function getAuthorInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed[0].toUpperCase() : "А";
}

function formatPublishedCount(count: number): string {
  if (count === 1) {
    return "1 опубликованный продукт";
  }

  if (count >= 2 && count <= 4) {
    return `${count} опубликованных продукта`;
  }

  return `${count} опубликованных продуктов`;
}

type AuthorPublicHeaderProps = {
  name: string;
  shortPositioning: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarImage?: unknown;
  bannerImage?: unknown;
  bannerPositionX?: number;
  bannerPositionY?: number;
  publishedCount: number;
};

export default function AuthorPublicHeader({
  name,
  shortPositioning,
  avatarUrl,
  bannerUrl,
  avatarImage,
  bannerImage,
  bannerPositionX = 50,
  bannerPositionY = 50,
  publishedCount,
}: AuthorPublicHeaderProps) {
  const avatarManifest = parseImageManifest(avatarImage);
  const bannerManifest = parseImageManifest(bannerImage);
  const bannerObjectPosition = formatBannerObjectPosition({
    x: bannerPositionX,
    y: bannerPositionY,
  });
  const positioningText = resolveAuthorPositioningText(shortPositioning);

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#eadff8] bg-white shadow-[0_12px_32px_rgba(91,62,145,0.08)]">
      <div className="relative h-32 sm:h-40 xl:h-48">
        {bannerUrl ? (
          <AuthorBannerImage
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            objectPosition={bannerObjectPosition}
            manifest={bannerManifest as ImageManifest | null}
            displayWidth={1280}
            priority
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={AUTHOR_DEFAULT_BANNER_PATH}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>

      <div className="relative bg-white px-5 pb-7 pt-0 sm:px-8 sm:pb-8">
        <div className="-mt-12 flex flex-col items-center text-center sm:-mt-14">
          <div className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[22px] border-4 border-white bg-white shadow-[0_10px_28px_rgba(91,62,145,0.16)] sm:h-[104px] sm:w-[104px] sm:rounded-[24px]">
            {avatarUrl ? (
              <AvatarImage
                src={avatarUrl}
                alt={buildAuthorAvatarAlt(name)}
                className="h-full w-full object-cover"
                manifest={avatarManifest as ImageManifest | null}
                size={104}
              />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={AUTHOR_DEFAULT_AVATAR_PATH}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <span className="sr-only">{getAuthorInitial(name)}</span>
              </>
            )}
          </div>

          <div className="mt-5 max-w-2xl">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#25135c] sm:text-[32px] xl:text-[36px]">
              {name}
            </h1>

            <p className="mt-3 text-[15px] leading-7 text-[#65577f] sm:text-[16px]">
              {positioningText}
            </p>

            <p className="mt-2 text-sm text-[#7d70a2]">
              {formatPublishedCount(publishedCount)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
