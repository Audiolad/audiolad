import {
  AuthorBannerImage,
  AvatarImage,
} from "@/components/images/ResponsiveImage";
import { formatBannerObjectPosition } from "@/lib/authors/banner-position";
import { buildAuthorAvatarAlt } from "@/lib/seo/cover-alt";
import { parseImageManifest } from "@/lib/images/image-manifest";
import type { ImageManifest } from "@/lib/images/image-types";

function getAuthorInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed[0].toUpperCase() : "А";
}

type AuthorPublicHeaderProps = {
  name: string;
  shortBio: string | null;
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
  shortBio,
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

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#eadff8] bg-white shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
      <div className="relative h-28 sm:h-36 xl:h-44">
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
          <div
            className="absolute inset-0 bg-gradient-to-br from-[#5b3e91] via-[#7042c5] to-[#a27bd9]"
            aria-hidden="true"
          />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#25135c]/55 via-transparent to-transparent"
          aria-hidden="true"
        />
      </div>

      <div className="relative px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-10 flex items-end gap-4 sm:-mt-12 sm:gap-5">
          <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[22px] border-4 border-white bg-gradient-to-br from-[#7042c5] to-[#a27bd9] text-3xl font-semibold text-white shadow-[0_8px_24px_rgba(91,62,145,0.18)] sm:h-[104px] sm:w-[104px] sm:rounded-[24px]">
            {avatarUrl ? (
              <AvatarImage
                src={avatarUrl}
                alt={buildAuthorAvatarAlt(name)}
                className="h-full w-full object-cover"
                manifest={avatarManifest as ImageManifest | null}
                size={104}
              />
            ) : (
              getAuthorInitial(name)
            )}
          </div>

          <div className="min-w-0 pb-1">
            <h1 className="text-[26px] font-semibold leading-tight text-[#25135c] sm:text-[32px] xl:text-[36px]">
              {name}
            </h1>
            {publishedCount > 0 ? (
              <p className="mt-1 text-sm text-[#7d70a2]">
                {publishedCount}{" "}
                {publishedCount === 1
                  ? "опубликованный продукт"
                  : publishedCount < 5
                    ? "опубликованных продукта"
                    : "опубликованных продуктов"}
              </p>
            ) : null}
          </div>
        </div>

        {shortBio ? (
          <p className="mt-4 text-[15px] leading-7 text-[#65577f] sm:text-[16px]">
            {shortBio}
          </p>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[#7d70a2]">
            Аудиопрактики и программы автора на платформе АудиоЛад.
          </p>
        )}
      </div>
    </section>
  );
}
