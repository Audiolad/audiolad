"use client";

import { useState } from "react";

import { AvatarImage } from "@/components/images/ResponsiveImage";
import { AUTHOR_DEFAULT_AVATAR_PATH } from "@/lib/authors/brand-assets";
import { buildAuthorAvatarAlt } from "@/lib/seo/cover-alt";
import type { ImageManifest } from "@/lib/images/image-types";

type AuthorAvatarImageProps = {
  name: string;
  avatarUrl: string | null;
  avatarManifest?: ImageManifest | null;
  size?: number;
  className?: string;
  emergencyInitial?: string;
  priority?: boolean;
};

function getAuthorInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed[0].toUpperCase() : "А";
}

export default function AuthorAvatarImage({
  name,
  avatarUrl,
  avatarManifest = null,
  size = 112,
  className = "h-full w-full object-cover",
  emergencyInitial,
  priority = false,
}: AuthorAvatarImageProps) {
  const [customAvatarFailed, setCustomAvatarFailed] = useState(false);
  const [defaultAvatarFailed, setDefaultAvatarFailed] = useState(false);

  const showCustomAvatar = Boolean(avatarUrl?.trim()) && !customAvatarFailed;
  const initial = emergencyInitial ?? getAuthorInitial(name);

  if (showCustomAvatar && avatarUrl) {
    return (
      <AvatarImage
        src={avatarUrl}
        alt={buildAuthorAvatarAlt(name)}
        className={className}
        manifest={avatarManifest}
        size={size}
        priority={priority}
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
        className={className}
        onError={() => setDefaultAvatarFailed(true)}
      />
    );
  }

  return (
    <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#7042c5] to-[#a27bd9] text-3xl font-semibold text-white">
      {initial}
    </span>
  );
}
