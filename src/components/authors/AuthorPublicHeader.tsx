import { formatBannerObjectPosition } from "@/lib/authors/banner-position";
import { resolveAuthorPositioningText } from "@/lib/authors/brand-assets";
import { formatAuthorPublishedCount } from "@/lib/authors/public-list";
import { parseImageManifest } from "@/lib/images/image-manifest";
import type { ImageManifest } from "@/lib/images/image-types";

import {
  AuthorHeaderAvatar,
  AuthorHeaderBanner,
} from "./AuthorPublicHeaderMedia";

function getAuthorInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed[0].toUpperCase() : "А";
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
  const avatarManifest = parseImageManifest(avatarImage) as ImageManifest | null;
  const bannerManifest = parseImageManifest(bannerImage) as ImageManifest | null;
  const bannerObjectPosition = formatBannerObjectPosition({
    x: bannerPositionX,
    y: bannerPositionY,
  });
  const positioningText = resolveAuthorPositioningText(shortPositioning);
  const hasCustomAvatar = Boolean(avatarUrl?.trim());

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#eadff8] bg-white shadow-[0_12px_32px_rgba(91,62,145,0.08)]">
      <div className="relative h-32 sm:h-40 xl:h-48">
        <AuthorHeaderBanner
          bannerUrl={bannerUrl}
          bannerManifest={bannerManifest}
          bannerObjectPosition={bannerObjectPosition}
        />
      </div>

      <div className="relative bg-white px-5 pb-7 sm:px-8 sm:pb-8">
        <div className="flex flex-col items-center text-center md:hidden">
          <div className="-mt-12 shrink-0 sm:-mt-14">
            <div
              className={`relative flex h-[88px] w-[88px] items-center justify-center overflow-hidden sm:h-[104px] sm:w-[104px] ${
                hasCustomAvatar
                  ? "rounded-[22px] border-4 border-white bg-white shadow-[0_10px_28px_rgba(91,62,145,0.16)] sm:rounded-[24px]"
                  : "rounded-[22px] bg-white shadow-[0_10px_28px_rgba(91,62,145,0.12)] sm:rounded-[24px]"
              }`}
            >
              <AuthorHeaderAvatar
                name={name}
                avatarUrl={avatarUrl}
                avatarManifest={avatarManifest}
                emergencyInitial={getAuthorInitial(name)}
              />
            </div>
          </div>

          <div className="mt-6 w-full min-w-0">
            <h1 className="text-balance break-words text-[26px] font-semibold leading-tight tracking-tight text-[#25135c] sm:text-[32px]">
              {name}
            </h1>

            <p className="mt-3 text-[15px] leading-7 text-[#65577f] sm:text-[16px]">
              {positioningText}
            </p>

            <p className="mt-2 text-sm text-[#7d70a2]">
              {formatAuthorPublishedCount(publishedCount)}
            </p>
          </div>
        </div>

        <div className="hidden md:grid md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-x-5">
          <div className="-mt-14 shrink-0">
            <div
              className={`relative flex h-[104px] w-[104px] items-center justify-center overflow-hidden ${
                hasCustomAvatar
                  ? "rounded-[24px] border-4 border-white bg-white shadow-[0_10px_28px_rgba(91,62,145,0.16)]"
                  : "rounded-[24px] bg-white shadow-[0_10px_28px_rgba(91,62,145,0.12)]"
              }`}
            >
              <AuthorHeaderAvatar
                name={name}
                avatarUrl={avatarUrl}
                avatarManifest={avatarManifest}
                emergencyInitial={getAuthorInitial(name)}
              />
            </div>
          </div>

          <div className="min-w-0 pt-8">
            <h1 className="text-balance break-words text-[32px] font-semibold leading-tight tracking-tight text-[#25135c] xl:text-[36px]">
              {name}
            </h1>

            <p className="mt-3 text-[16px] leading-7 text-[#65577f]">
              {positioningText}
            </p>

            <p className="mt-2 text-sm text-[#7d70a2]">
              {formatAuthorPublishedCount(publishedCount)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
