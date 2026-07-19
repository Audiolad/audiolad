"use client";

import { useState } from "react";

import { AuthorBannerImage } from "@/components/images/ResponsiveImage";
import AuthorAvatarImage from "@/components/authors/AuthorAvatarImage";
import { AUTHOR_DEFAULT_BANNER_PATH } from "@/lib/authors/brand-assets";
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
  return (
    <AuthorAvatarImage
      name={name}
      avatarUrl={avatarUrl}
      avatarManifest={avatarManifest}
      size={104}
      emergencyInitial={emergencyInitial}
      priority
      className="h-full w-full object-cover"
    />
  );
}
