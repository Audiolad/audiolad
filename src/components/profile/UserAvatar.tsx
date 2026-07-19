"use client";

import Image from "next/image";
import { useState } from "react";

export type UserAvatarProps = {
  avatarUrl: string | null;
  initial: string;
  size: number;
  className?: string;
  initialClassName?: string;
  fill?: boolean;
};

export default function UserAvatar({
  avatarUrl,
  initial,
  size,
  className = "",
  initialClassName = "",
  fill = false,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(avatarUrl) && !imageFailed;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {showImage ? (
        fill ? (
          <Image
            src={avatarUrl!}
            alt=""
            fill
            unoptimized
            className="object-cover"
            sizes={`${size}px`}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Image
            src={avatarUrl!}
            alt=""
            width={size}
            height={size}
            unoptimized
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        )
      ) : (
        <span className={initialClassName}>{initial}</span>
      )}
    </span>
  );
}
