"use client";

import { useMemo, useState } from "react";

import {
  getPlaceholderBlurFromManifest,
  pickResponsiveVariantKey,
} from "@/lib/images/image-url";
import type { ImageManifest, ImageVariantKey } from "@/lib/images/image-types";

export type ResponsiveImageProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  manifest?: ImageManifest | null;
  variant?: ImageVariantKey;
  renderedWidth?: number;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  decoding?: "async" | "sync" | "auto";
  onError?: () => void;
  draggable?: boolean;
  sizes?: string;
  srcSet?: string | null;
  objectPosition?: string;
};

export default function ResponsiveImage({
  src,
  alt,
  className = "",
  manifest,
  variant,
  renderedWidth,
  loading = "lazy",
  fetchPriority = "auto",
  decoding = "async",
  onError,
  draggable,
  sizes,
  srcSet,
  objectPosition,
}: ResponsiveImageProps) {
  const [failed, setFailed] = useState(false);
  const blur = useMemo(
    () => getPlaceholderBlurFromManifest(manifest),
    [manifest],
  );

  const resolvedVariant =
    variant ??
    (typeof renderedWidth === "number"
      ? pickResponsiveVariantKey(renderedWidth)
      : "md");

  if (!src || failed) {
    if (blur) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={blur}
          alt=""
          aria-hidden
          className={`${className} scale-110 blur-sm`}
        />
      );
    }

    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding={decoding}
      draggable={draggable}
      sizes={sizes}
      srcSet={srcSet ?? undefined}
      style={{
        ...(objectPosition ? { objectPosition } : {}),
        ...(blur
          ? {
              backgroundImage: `url(${blur})`,
              backgroundSize: "cover",
            }
          : {}),
      }}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}

export type ResponsiveCoverImageProps = Omit<
  ResponsiveImageProps,
  "variant" | "renderedWidth"
> & {
  /** Approximate rendered width in CSS pixels for variant selection. */
  displayWidth: number;
  priority?: boolean;
};

export function ResponsiveCoverImage({
  displayWidth,
  priority = false,
  loading,
  fetchPriority,
  ...rest
}: ResponsiveCoverImageProps) {
  const variant = pickResponsiveVariantKey(displayWidth);

  return (
    <ResponsiveImage
      {...rest}
      variant={variant}
      renderedWidth={displayWidth}
      loading={priority ? "eager" : (loading ?? "lazy")}
      fetchPriority={priority ? "high" : (fetchPriority ?? "auto")}
    />
  );
}

export type AvatarImageProps = Omit<ResponsiveCoverImageProps, "displayWidth"> & {
  size: number;
};

export function AvatarImage({ size, ...rest }: AvatarImageProps) {
  return <ResponsiveCoverImage {...rest} displayWidth={size} />;
}

export type AuthorBannerImageProps = ResponsiveCoverImageProps;

export function AuthorBannerImage(props: AuthorBannerImageProps) {
  return <ResponsiveCoverImage {...props} displayWidth={props.displayWidth} />;
}
