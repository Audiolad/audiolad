import CatalogCardView from "@/components/catalog/cards/CatalogCardView";
import type { CatalogCardPlayback } from "@/components/catalog/cards/CatalogCardShell";
import type { CatalogCard } from "@/lib/catalog/dto";

type CatalogProductGridCardProps = {
  product: CatalogCard;
  isAuthenticated?: boolean;
  signInReturnPath?: string;
  playback?: CatalogCardPlayback;
  onHeartSavedChange?: (saved: boolean) => void;
};

/**
 * Catalog card entry. Switches layout only by CatalogCard.class.
 */
export default function CatalogProductGridCard({
  product,
  isAuthenticated = false,
  signInReturnPath = "/catalog",
  playback = "default",
  onHeartSavedChange,
}: CatalogProductGridCardProps) {
  return (
    <CatalogCardView
      card={product}
      isAuthenticated={isAuthenticated}
      signInReturnPath={signInReturnPath}
      playback={playback}
      onHeartSavedChange={onHeartSavedChange}
    />
  );
}
