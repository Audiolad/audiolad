export const LIBRARY_FALLBACK_COVER_SRC = "/audiolad-logo.png";
export const LIBRARY_FALLBACK_COVER_SURFACE = "#f4ecfb";

type LibraryFallbackCoverProps = {
  title: string;
};

export default function LibraryFallbackCover({
  title,
}: LibraryFallbackCoverProps) {
  return (
    <div
      data-library-fallback-cover
      className="flex aspect-square w-full items-center justify-center bg-[#f4ecfb]"
      aria-label={title}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- official static brand mark */}
      <img
        src={LIBRARY_FALLBACK_COVER_SRC}
        alt=""
        className="h-[42%] w-[42%] object-contain"
        draggable={false}
      />
    </div>
  );
}
