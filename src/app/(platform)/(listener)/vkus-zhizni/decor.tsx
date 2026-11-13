import type { ReactNode } from "react";

/**
 * Decorative inline illustrations for the «Вкус жизни» landing (eb792a06).
 * Pure SVG, aria-hidden, no external images. Palette: AudioLad violet and
 * lavender with fresh green, rose, peach and honey accents.
 */

type DecorProps = { className?: string };

const LEAF = "#8cc4a4";
const LEAF_DARK = "#5f9f80";
const ROSE = "#f2a7c0";
const PEACH = "#f8c9a6";
const HONEY = "#f3d38a";
const LAVENDER = "#d9c5f6";
const VIOLET = "#7042c5";

function Flower({
  cx,
  cy,
  r,
  petal,
  center = HONEY,
}: {
  cx: number;
  cy: number;
  r: number;
  petal: string;
  center?: string;
}) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse
          key={angle}
          cx={cx}
          cy={cy - r}
          rx={r * 0.62}
          ry={r}
          fill={petal}
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.48} fill={center} />
    </g>
  );
}

function Leaf({
  x,
  y,
  angle,
  size = 1,
  fill = LEAF,
}: {
  x: number;
  y: number;
  angle: number;
  size?: number;
  fill?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
      <path d="M0 0 C 10 -14, 30 -14, 40 0 C 30 14, 10 14, 0 0 Z" fill={fill} />
      <path d="M2 0 L 36 0" stroke={LEAF_DARK} strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
    </g>
  );
}

/** Hero still life: open book, cup, flowers and leaves. */
export function HeroDecor({ className }: DecorProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 260"
      className={className}
    >
      <circle cx="190" cy="130" r="118" fill="#f3eaff" />
      <circle cx="250" cy="70" r="46" fill="#fff1e4" />
      {/* stems */}
      <path d="M196 170 C 190 120, 200 80, 214 44" stroke={LEAF_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M206 172 C 222 130, 250 104, 276 92" stroke={LEAF_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M188 172 C 170 136, 150 118, 124 108" stroke={LEAF_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Leaf x={200} y={118} angle={-60} size={0.9} />
      <Leaf x={232} y={124} angle={-20} size={0.8} fill="#a7d3b8" />
      <Leaf x={168} y={136} angle={-150} size={0.85} />
      <Leaf x={150} y={120} angle={-200} size={0.7} fill="#a7d3b8" />
      <Flower cx={214} cy={44} r={15} petal={ROSE} />
      <Flower cx={276} cy={92} r={13} petal={LAVENDER} />
      <Flower cx={124} cy={106} r={12} petal={PEACH} />
      {/* open book */}
      <path d="M70 196 C 110 178, 150 182, 176 196 L 176 236 C 150 222, 110 220, 70 236 Z" fill="#ffffff" stroke={LAVENDER} strokeWidth="2" />
      <path d="M282 196 C 242 178, 202 182, 176 196 L 176 236 C 202 222, 242 220, 282 236 Z" fill="#fffaf3" stroke={LAVENDER} strokeWidth="2" />
      <path d="M90 200 C 115 192, 140 192, 160 200 M90 212 C 115 204, 140 204, 160 212 M196 200 C 216 192, 240 192, 262 200 M196 212 C 216 204, 240 204, 262 212" stroke="#e3d6f7" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* cup */}
      <path d="M22 176 h 46 v 22 a 23 23 0 0 1 -46 0 Z" fill={VIOLET} opacity="0.88" />
      <path d="M68 182 a 10 10 0 0 1 0 20" stroke={VIOLET} strokeWidth="4" fill="none" opacity="0.88" />
      <path d="M36 166 c -6 -8, 6 -12, 0 -20 M52 166 c -6 -8, 6 -12, 0 -20" stroke="#c9b3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* notes */}
      <g fill={VIOLET} opacity="0.7">
        <circle cx="96" cy="58" r="6" />
        <rect x="100" y="26" width="2.6" height="32" rx="1.3" />
        <path d="M102.6 26 c 8 2, 12 8, 10 16 c -2 -6, -6 -8, -10 -8 Z" />
        <circle cx="56" cy="96" r="4.5" opacity="0.7" />
        <rect x="59" y="72" width="2" height="24" rx="1" opacity="0.7" />
      </g>
    </svg>
  );
}

/** Small centred sprig used as a section divider. */
export function SprigDivider({ className }: DecorProps) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 200 40" className={className}>
      <path d="M20 20 H 82 M118 20 H 180" stroke="#e3d6f7" strokeWidth="2" strokeLinecap="round" />
      <Leaf x={100} y={20} angle={-160} size={0.55} />
      <Leaf x={100} y={20} angle={-20} size={0.55} fill="#a7d3b8" />
      <Flower cx={100} cy={20} r={7} petal={ROSE} />
    </svg>
  );
}

/** Corner bouquet for highlighted cards. */
export function CornerBouquet({ className }: DecorProps) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 140 120" className={className}>
      <path d="M120 116 C 110 80, 96 60, 70 40" stroke={LEAF_DARK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M124 116 C 124 86, 116 52, 112 22" stroke={LEAF_DARK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <Leaf x={98} y={70} angle={-140} size={0.7} />
      <Leaf x={118} y={64} angle={-80} size={0.6} fill="#a7d3b8" />
      <Flower cx={70} cy={40} r={11} petal={LAVENDER} />
      <Flower cx={112} cy={22} r={10} petal={PEACH} />
    </svg>
  );
}

/** Tiny icons for the two directions. */
export function NoteIcon({ className }: DecorProps) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 40 40" className={className}>
      <circle cx="20" cy="20" r="20" fill="#f1e9fb" />
      <g fill={VIOLET}>
        <circle cx="16" cy="27" r="4" />
        <rect x="18.6" y="11" width="2.2" height="16" rx="1.1" />
        <path d="M20.8 11 c 6 1.5, 8 5, 7 10 c -1.5 -4, -4 -5, -7 -5 Z" />
      </g>
    </svg>
  );
}

export function LotusIcon({ className }: DecorProps) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 40 40" className={className}>
      <circle cx="20" cy="20" r="20" fill="#eef7f1" />
      <path d="M20 12 C 24 17, 24 23, 20 28 C 16 23, 16 17, 20 12 Z" fill={ROSE} />
      <path d="M20 28 C 14 27, 10 23, 9 18 C 14 18, 18 22, 20 28 Z" fill={LAVENDER} />
      <path d="M20 28 C 26 27, 30 23, 31 18 C 26 18, 22 22, 20 28 Z" fill={LAVENDER} />
      <path d="M11 30 H 29" stroke={LEAF_DARK} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconFrame({
  className,
  bg,
  children,
}: DecorProps & { bg: string; children: ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 40 40" className={className}>
      <circle cx="20" cy="20" r="20" fill={bg} />
      {children}
    </svg>
  );
}

export function CupIcon({ className }: DecorProps) {
  return (
    <IconFrame className={className} bg="#fff1e4">
      <path d="M11 18 h 15 v 6 a 7.5 7.5 0 0 1 -15 0 Z" fill={VIOLET} />
      <path d="M26 19.5 a 3.5 3.5 0 0 1 0 7" stroke={VIOLET} strokeWidth="2" fill="none" />
      <path d="M15 15 c -2 -2.5, 2 -3.5, 0 -6 M20 15 c -2 -2.5, 2 -3.5, 0 -6" stroke="#c9b3ee" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </IconFrame>
  );
}

export function ParkIcon({ className }: DecorProps) {
  return (
    <IconFrame className={className} bg="#eef7f1">
      <path d="M20 30 V 20" stroke={LEAF_DARK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="16" r="7" fill={LEAF} />
      <circle cx="15.5" cy="19" r="4.5" fill="#a7d3b8" />
      <circle cx="24.5" cy="19" r="4.5" fill="#a7d3b8" />
      <path d="M10 30 H 30" stroke={LEAF_DARK} strokeWidth="1.6" strokeLinecap="round" />
    </IconFrame>
  );
}

export function SunIcon({ className }: DecorProps) {
  return (
    <IconFrame className={className} bg="#fff6dc">
      <circle cx="20" cy="20" r="6" fill={HONEY} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect key={a} x="19" y="8" width="2" height="4" rx="1" fill="#e9b949" transform={`rotate(${a} 20 20)`} />
      ))}
    </IconFrame>
  );
}

export function MoonIcon({ className }: DecorProps) {
  return (
    <IconFrame className={className} bg="#f1e9fb">
      <path d="M24 11 a 9.5 9.5 0 1 0 5 16 a 8 8 0 0 1 -5 -16 Z" fill={VIOLET} opacity="0.85" />
      <circle cx="28" cy="13" r="1.2" fill={HONEY} />
      <circle cx="31" cy="19" r="0.9" fill={HONEY} />
    </IconFrame>
  );
}

export function BookIcon({ className }: DecorProps) {
  return (
    <IconFrame className={className} bg="#f1e9fb">
      <path d="M9 14 c 4 -2, 8 -2, 11 0 v 13 c -3 -2, -7 -2, -11 0 Z" fill="#ffffff" stroke={VIOLET} strokeWidth="1.5" />
      <path d="M31 14 c -4 -2, -8 -2, -11 0 v 13 c 3 -2, 7 -2, 11 0 Z" fill="#fffaf3" stroke={VIOLET} strokeWidth="1.5" />
    </IconFrame>
  );
}

export function CalendarIcon({ className }: DecorProps) {
  return (
    <IconFrame className={className} bg="#fdeef3">
      <rect x="11" y="13" width="18" height="16" rx="3" fill="#ffffff" stroke={VIOLET} strokeWidth="1.5" />
      <path d="M11 18 H 29" stroke={VIOLET} strokeWidth="1.5" />
      <path d="M15 11 v 4 M25 11 v 4" stroke={VIOLET} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20" cy="23.5" r="2.6" fill={ROSE} />
    </IconFrame>
  );
}

/** Tall faded branch for the wide-screen margin. */
export function SideBranch({ className }: DecorProps) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 120 360" className={className}>
      <path d="M60 356 C 54 280, 70 200, 58 120 C 52 80, 60 40, 72 6" stroke={LEAF_DARK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <Leaf x={58} y={300} angle={-150} size={0.9} />
      <Leaf x={62} y={260} angle={-30} size={0.85} fill="#a7d3b8" />
      <Leaf x={60} y={210} angle={-160} size={0.8} fill="#a7d3b8" />
      <Leaf x={62} y={170} angle={-25} size={0.8} />
      <Leaf x={56} y={120} angle={-150} size={0.7} />
      <Leaf x={60} y={80} angle={-35} size={0.65} fill="#a7d3b8" />
      <Flower cx={72} cy={10} r={10} petal={ROSE} />
      <Flower cx={36} cy={140} r={7} petal={LAVENDER} />
      <Flower cx={92} cy={236} r={7} petal={PEACH} />
    </svg>
  );
}
