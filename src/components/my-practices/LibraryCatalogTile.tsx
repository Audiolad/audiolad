import CatalogProductGridCard from "@/components/products/CatalogProductGridCard";
import { unifiedCatalogEntryToCatalogCard } from "@/lib/library/unified-catalog-card";
import type { UnifiedCatalogLibraryEntry } from "@/lib/library/unified-entry";

type LibraryCatalogTileProps = {
  entry: UnifiedCatalogLibraryEntry;
  highlighted?: boolean;
  onHeartSavedChange?: (saved: boolean) => void;
};

export default function LibraryCatalogTile({
  entry,
  highlighted = false,
  onHeartSavedChange,
}: LibraryCatalogTileProps) {
  const card = unifiedCatalogEntryToCatalogCard(entry);

  return (
    <div
      data-library-catalog-tile
      data-library-highlighted={highlighted ? "true" : "false"}
      className={
        highlighted ? "rounded-[20px] ring-2 ring-[#7042c5]/30" : undefined
      }
    >
      <CatalogProductGridCard
        product={card}
        isAuthenticated
        signInReturnPath="/my-practices"
        playback={entry.canListen ? "default" : "none"}
        onHeartSavedChange={onHeartSavedChange}
      />
    </div>
  );
}
