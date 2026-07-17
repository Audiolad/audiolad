import CoverBadge from "./CoverBadge";
import type { CoverBadgeSize } from "./cover-badge-types";

type GiftBadgeProps = {
  className?: string;
  size?: CoverBadgeSize;
};

export default function GiftBadge({ className = "", size = "md" }: GiftBadgeProps) {
  return <CoverBadge kind="gift" size={size} className={className} />;
}
