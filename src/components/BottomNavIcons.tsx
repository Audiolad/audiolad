type NavIconProps = {
  active?: boolean;
  className?: string;
};

const iconBase =
  "h-[26px] w-[26px] shrink-0 motion-reduce:transition-none";

function strokeProps(active: boolean) {
  return {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: active ? 2.25 : 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function HomeNavIcon({ active = false, className }: NavIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${iconBase} ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        {...strokeProps(active)}
        d="M4.5 10.2 12 4.5l7.5 5.7V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19v-8.8Z"
      />
      <path
        {...strokeProps(active)}
        d="M9.5 20.5V13a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v7.5"
      />
    </svg>
  );
}

export function CatalogNavIcon({ active = false, className }: NavIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${iconBase} ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        {...strokeProps(active)}
        x="4"
        y="4"
        width="6.5"
        height="6.5"
        rx="1.25"
      />
      <rect
        {...strokeProps(active)}
        x="13.5"
        y="4"
        width="6.5"
        height="6.5"
        rx="1.25"
      />
      <rect
        {...strokeProps(active)}
        x="4"
        y="13.5"
        width="6.5"
        height="6.5"
        rx="1.25"
      />
      <rect
        {...strokeProps(active)}
        x="13.5"
        y="13.5"
        width="6.5"
        height="6.5"
        rx="1.25"
      />
    </svg>
  );
}

export function LibraryNavIcon({ active = false, className }: NavIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${iconBase} ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 20.5s-6.75-4.35-6.75-9.1C5.25 7.8 8.2 5.5 12 5.5s6.75 2.3 6.75 5.9c0 4.75-6.75 9.1-6.75 9.1Z"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlaylistsNavIcon({ active = false, className }: NavIconProps) {
  const dotRadius = active ? 1.35 : 1.15;

  return (
    <svg
      viewBox="0 0 24 24"
      className={`${iconBase} ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        {...strokeProps(active)}
        d="M9.5 8.5h9M9.5 12.5h9M9.5 16.5h9"
      />
      <circle cx="5.25" cy="8.5" r={dotRadius} fill="currentColor" stroke="none" />
      <circle cx="5.25" cy="12.5" r={dotRadius} fill="currentColor" stroke="none" />
      <circle cx="5.25" cy="16.5" r={dotRadius} fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ProfileNavIcon({ active = false, className }: NavIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${iconBase} ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <circle {...strokeProps(active)} cx="12" cy="12" r="8.75" />
      <circle
        {...strokeProps(active)}
        cx="12"
        cy="10"
        r="2.75"
        fill={active ? "currentColor" : "none"}
      />
      <path
        {...strokeProps(active)}
        d="M7.25 17.25c1.1-2.1 2.55-3.15 4.75-3.15s3.65 1.05 4.75 3.15"
      />
    </svg>
  );
}
