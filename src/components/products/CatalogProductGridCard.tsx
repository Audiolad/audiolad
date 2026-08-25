import CatalogCardView from "@/components/catalog/cards/CatalogCardView";
import type { CatalogCard } from "@/lib/catalog/dto";

type CatalogProductGridCardProps = {
  product: CatalogCard;
  isAuthenticated?: boolean;
  signInReturnPath?: string;
};

/**
 * Catalog card entry. Switches layout only by CatalogCard.class.
 */
export default function CatalogProductGridCard({
  product,
  isAuthenticated = false,
  signInReturnPath = "/catalog",
}: CatalogProductGridCardProps) {
  return (
    <CatalogCardView
      card={product}
      isAuthenticated={isAuthenticated}
      signInReturnPath={signInReturnPath}
    />
  );
}
