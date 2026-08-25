import CatalogCardShell, {
  type CatalogCardLayoutProps,
} from "@/components/catalog/cards/CatalogCardShell";

/** Future audiobook layout. No Audiobook entity or builder in Phase 0. */
export default function AudiobookCatalogCard(props: CatalogCardLayoutProps) {
  return <CatalogCardShell {...props} />;
}
