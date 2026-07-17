type GiftBadgeSize = "sm" | "md";

type GiftBadgeProps = {
  className?: string;
  size?: GiftBadgeSize;
};

const SIZE_CLASSES: Record<
  GiftBadgeSize,
  { container: string; icon: string }
> = {
  sm: {
    container: "left-2 top-2 h-8 w-8 shadow-[0_6px_16px_rgba(96,59,168,0.24)]",
    icon: "h-4 w-4",
  },
  md: {
    container:
      "left-2.5 top-2.5 h-10 w-10 shadow-[0_8px_20px_rgba(96,59,168,0.28)]",
    icon: "h-5 w-5",
  },
};

function GiftIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="8" width="18" height="4" rx="0.5" />
      <path d="M12 8v13" />
      <path d="M7.5 7.5C9 5.5 12 5.5 12 8c0-2.5 3-2.5 4.5-0.5" />
      <path d="M3 12h18v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8z" />
    </svg>
  );
}

export default function GiftBadge({
  className = "",
  size = "md",
}: GiftBadgeProps) {
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={`pointer-events-none absolute flex items-center justify-center rounded-full bg-[#7042c5] text-white ${sizeClass.container} ${className}`}
      role="img"
      aria-label="Подарок"
      title="Подарок"
    >
      <GiftIcon className={sizeClass.icon} />
    </span>
  );
}
