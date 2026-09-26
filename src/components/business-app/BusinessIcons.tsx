type IconProps = {
  active?: boolean;
  className?: string;
};

const iconBase = "h-5 w-5 shrink-0";

function stroke(active: boolean) {
  return {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: active ? 2.1 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function BizHomeIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <path {...stroke(active)} d="M4.5 10.2 12 4.5l7.5 5.7V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19v-8.8Z" />
      <path {...stroke(active)} d="M9.5 20.5V13a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v7.5" />
    </svg>
  );
}

export function BizLocationsIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <path {...stroke(active)} d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle {...stroke(active)} cx="12" cy="11" r="2.2" />
    </svg>
  );
}

export function BizMusicIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <path {...stroke(active)} d="M9 18V6l10-2v12" />
      <circle {...stroke(active)} cx="7" cy="18" r="2.5" />
      <circle {...stroke(active)} cx="17" cy="16" r="2.5" />
    </svg>
  );
}

export function BizStatsIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <path {...stroke(active)} d="M5 19V10M12 19V5M19 19v-7" />
    </svg>
  );
}

export function BizAnnouncementsIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <path {...stroke(active)} d="M4 10v4h3l5 4V6L7 10H4Z" />
      <path {...stroke(active)} d="M16.5 8.5a4.5 4.5 0 0 1 0 7" />
    </svg>
  );
}

export function BizDocumentsIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <path {...stroke(active)} d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path {...stroke(active)} d="M14 3.5V8h4.5M8.5 12h7M8.5 16h5" />
    </svg>
  );
}

export function BizTeamIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <circle {...stroke(active)} cx="9" cy="8" r="3" />
      <circle {...stroke(active)} cx="17" cy="9" r="2.4" />
      <path {...stroke(active)} d="M3.5 19a5.5 5.5 0 0 1 11 0M14 19a4 4 0 0 1 6.5-3.1" />
    </svg>
  );
}

export function BizSettingsIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <circle {...stroke(active)} cx="12" cy="12" r="3.2" />
      <path {...stroke(active)} d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
    </svg>
  );
}

export function BizHelpIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <circle {...stroke(active)} cx="12" cy="12" r="8.5" />
      <path {...stroke(active)} d="M9.6 9.4a2.4 2.4 0 1 1 3.5 2.1c-.7.4-1.1.9-1.1 1.8V14" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function BizMoreIcon({ active = false, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${iconBase} ${className ?? ""}`} aria-hidden focusable="false">
      <circle cx="6" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function BizPrevIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className ?? ""}`} aria-hidden focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M18 6 10 12l8 6M6 6v12" />
    </svg>
  );
}

export function BizPauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className ?? ""}`} aria-hidden focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M8 6v12M16 6v12" />
    </svg>
  );
}

export function BizPlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className ?? ""}`} aria-hidden focusable="false">
      <path fill="currentColor" d="M9 7.2v9.6L17.2 12 9 7.2Z" />
    </svg>
  );
}

export function BizNextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className ?? ""}`} aria-hidden focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 6-8 6M18 6v12" />
    </svg>
  );
}

export function BizCollapseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className ?? ""}`} aria-hidden focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M15 6 9 12l6 6" />
    </svg>
  );
}

export function BizExpandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className ?? ""}`} aria-hidden focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}
