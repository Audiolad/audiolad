"use client";

import LibraryCardPlayButton from "./LibraryCardPlayButton";

type LibraryCardPreviewPlayButtonProps = {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  title: string;
};

/** Locked Audioteka Play: same GlobalAudioPlayer path, preview session from /api/catalog/play. */
export default function LibraryCardPreviewPlayButton({
  practiceId,
  authorSlug,
  productSlug,
  title,
}: LibraryCardPreviewPlayButtonProps) {
  return (
    <LibraryCardPlayButton
      practiceId={practiceId}
      authorSlug={authorSlug}
      productSlug={productSlug}
      title={title}
      variant="preview"
      label="Слушать"
    />
  );
}
