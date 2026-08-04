type IconProps = {
  className?: string;
};

function iconClass(className?: string) {
  return className ?? "h-6 w-6";
}

export function SchoolMicIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
      <path d="M12 17v3.5" />
      <path d="M8.5 20.5h7" />
    </svg>
  );
}

export function SchoolHomeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 10.5 12 4l7.5 6.5" />
      <path d="M7 9.75V19.5h10V9.75" />
    </svg>
  );
}

export function SchoolCarIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 16.5h12" />
      <path d="M7.5 16.5 8.7 10.8a1.5 1.5 0 0 1 1.47-1.15h3.66A1.5 1.5 0 0 1 15.3 10.8L16.5 16.5" />
      <path d="M8 13h8" />
      <circle cx="8.5" cy="17.75" r="1.25" />
      <circle cx="15.5" cy="17.75" r="1.25" />
      <path d="M9.5 9.65 10.2 7.9A1 1 0 0 1 11.12 7.3h1.76a1 1 0 0 1 .92.6l.7 1.75" />
    </svg>
  );
}

export function SchoolWalkIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="13" cy="5" r="1.6" />
      <path d="M11.2 9.2 13 8.4l1.6 2.4 2.2 1.1" />
      <path d="M10.2 21.2 12.1 15l-2.3-1.7-1.7 3.1" />
      <path d="M12.1 15 13.8 12.2 11 9.8 8.8 11.4" />
    </svg>
  );
}

export function SchoolFitnessIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 8.5v7" />
      <path d="M15.5 8.5v7" />
      <path d="M6 10v4" />
      <path d="M18 10v4" />
      <path d="M8.5 12h7" />
      <path d="M4.5 11v2" />
      <path d="M19.5 11v2" />
    </svg>
  );
}

export function SchoolSleepIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClass(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15.5 4.5A7.5 7.5 0 1 0 19.5 14 6 6 0 0 1 15.5 4.5Z" />
    </svg>
  );
}
