"use client";

import { useState } from "react";

import {
  AuthorBannerImage,
  AvatarImage,
} from "@/components/images/ResponsiveImage";
import {
  AUTHOR_DEFAULT_AVATAR_PATH,
  AUTHOR_DEFAULT_BANNER_PATH,
} from "@/lib/authors/brand-assets";
import { buildAuthorAvatarAlt } from "@/lib/seo/cover-alt";
import type { ImageManifest } from "@/lib/images/image-types";

type AuthorHeaderBannerProps = {
  bannerUrl: string | null;
  bannerManifest: ImageManifest | null;
  bannerObjectPosition: string;
};

export function AuthorHeaderBanner({
  bannerUrl,
  bannerManifest,
  bannerObjectPosition,
}: AuthorHeaderBannerProps) {
  const [useDefaultBanner, setUseDefaultBanner] = useState(!bannerUrl);

  if (useDefaultBanner || !bannerUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={AUTHOR_DEFAULT_BANNER_PATH}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    );
  }

  return (
    <AuthorBannerImage
      src={bannerUrl}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      objectPosition={bannerObjectPosition}
      manifest={bannerManifest}
      displayWidth={1280}
      priority
      onError={() => setUseDefaultBanner(true)}
    />
  );
}

type AuthorHeaderAvatarProps = {
  name: string;
  avatarUrl: string | null;
  avatarManifest: ImageManifest | null;
  emergencyInitial: string;
};

export function AuthorHeaderAvatar({
  name,
  avatarUrl,
  avatarManifest,
  emergencyInitial,
}: AuthorHeaderAvatarProps) {
  const [customAvatarFailed, setCustomAvatarFailed] = useState(false);
  const [defaultAvatarFailed, setDefaultAvatarFailed] = useState(false);

  const showCustomAvatar = Boolean(avatarUrl) && !customAvatarFailed;

  if (showCustomAvatar && avatarUrl) {
    return (
      <AvatarImage
        src={avatarUrl}
        alt={buildAuthorAvatarAlt(name)}
        className="h-full w-full object-cover"
        manifest={avatarManifest}
        size={104}
        onError={() => setCustomAvatarFailed(true)}
      />
    );
  }

  if (!defaultAvatarFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={AUTHOR_DEFAULT_AVATAR_PATH}
        alt=""
        className="h-full w-full object-contain"
        onError={() => setDefaultAvatarFailed(true)}
      />
    );
  }

  return (
    <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#7042c5] to-[#a27bd9] text-3xl font-semibold text-white sm:text-4xl">
      {emergencyInitial}
    </span>
  );
}
