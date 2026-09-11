"use client";

import {
  REPEAT_MODE_ARIA_LABELS,
  type RepeatMode,
} from "@/lib/listen/repeat-mode";

function RepeatIcon({
  className = "h-5 w-5",
  showOne = false,
  compact = false,
}: {
  className?: string;
  showOne?: boolean;
  compact?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={compact ? "2.5" : "1.75"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {compact ? (
        <>
          <path d="M17.5 1.35v5.4h5.15" />
          <path d="M22.65 6.75A10.35 10.35 0 0 0 4.15 11.55" />
          <path d="M6.5 22.65v-5.4H1.35" />
          <path d="M1.35 17.25A10.35 10.35 0 0 0 19.85 12.45" />
        </>
      ) : (
        <>
          <path d="M17 2v4h4" />
          <path d="M21 6a9 9 0 0 0-15.5 6" />
          <path d="M7 22v-4H3" />
          <path d="M3 18a9 9 0 0 0 15.5-6" />
        </>
      )}
      {showOne ? (
        <text
          x="12"
          y={compact ? "16.2" : "13.2"}
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontSize={compact ? "13.5" : "8"}
          fontWeight={compact ? "900" : "700"}
        >
          1
        </text>
      ) : null}
    </svg>
  );
}

const VARIANT_CLASS = {
  onDark: {
    default:
      "inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-white/20 px-2.5 text-white/90 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
    compact:
      "inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-white/20 px-0 text-white/90 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
  },
  onLight:
    "inline-flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full border border-[#eadff8] text-[#7042c5] transition hover:border-[#dcc9f2] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]",
} as const;

export default function RepeatModeButton({
  repeatMode,
  onCycle,
  variant,
  iconVariant = "default",
  className = "",
}: {
  repeatMode: RepeatMode;
  onCycle: () => void;
  variant: "onDark" | "onLight";
  iconVariant?: "default" | "compact";
  className?: string;
}) {
  const active = repeatMode !== "off";
  const variantClass =
    variant === "onDark"
      ? VARIANT_CLASS.onDark[iconVariant]
      : VARIANT_CLASS.onLight;

  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={REPEAT_MODE_ARIA_LABELS[repeatMode]}
      aria-pressed={active}
      data-repeat-mode={repeatMode}
      className={`${variantClass} ${
        active
          ? variant === "onDark"
            ? "bg-white/20 text-white"
            : "border-[#dcc9f2] bg-[#f3ebfc] text-[#7042c5]"
          : variant === "onDark"
            ? "text-white/55"
            : "text-[#9485b4]"
      } ${className}`}
    >
      <RepeatIcon
        className={iconVariant === "compact" ? "h-7 w-7 shrink-0" : undefined}
        showOne={repeatMode === "one"}
        compact={iconVariant === "compact"}
      />
    </button>
  );
}
