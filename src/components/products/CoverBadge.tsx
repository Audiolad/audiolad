import type {
  CoverBadgeKind,
  CoverBadgeSize,
  CoverBadgeVariant,
} from "./cover-badge-types";

type CoverBadgeProps = {
  kind: CoverBadgeKind;
  size?: CoverBadgeSize;
  variant?: CoverBadgeVariant;
  className?: string;
};

const SIZE_CLASSES: Record<
  CoverBadgeSize,
  { container: string; icon: string }
> = {
  sm: {
    container: "left-2 top-2 h-8 w-8",
    icon: "h-4 w-4",
  },
  md: {
    container: "left-2.5 top-2.5 h-10 w-10",
    icon: "h-5 w-5",
  },
};

const GLASS_SURFACE_CLASS =
  "border border-white/25 bg-[rgba(109,74,212,0.35)] shadow-[0_4px_14px_rgba(41,22,94,0.14)] backdrop-blur-[8px] [-webkit-backdrop-filter:blur(8px)]";

const BADGE_LABELS: Record<CoverBadgeKind, string> = {
  gift: "Подарок",
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

function CoverBadgeIcon({
  kind,
  className,
}: {
  kind: CoverBadgeKind;
  className: string;
}) {
  switch (kind) {
    case "gift":
      return <GiftIcon className={className} />;
    default:
      return null;
  }
}

export default function CoverBadge({
  kind,
  size = "md",
  className = "",
}: CoverBadgeProps) {
  const sizeClass = SIZE_CLASSES[size];
  const label = BADGE_LABELS[kind];

  return (
    <span
      className={`pointer-events-none absolute flex items-center justify-center rounded-full text-white ${GLASS_SURFACE_CLASS} ${sizeClass.container} ${className}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <CoverBadgeIcon kind={kind} className={sizeClass.icon} />
    </span>
  );
}
