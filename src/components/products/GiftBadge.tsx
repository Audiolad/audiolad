import CoverBadge from "./CoverBadge";
import type { CoverBadgeSize, CoverBadgeVariant } from "./cover-badge-types";

type GiftBadgeProps = {
  className?: string;
  size?: CoverBadgeSize;
  variant?: CoverBadgeVariant;
};

export default function GiftBadge({
  className = "",
  size = "md",
  variant = "glass",
}: GiftBadgeProps) {
  return (
    <CoverBadge kind="gift" size={size} variant={variant} className={className} />
  );
}
