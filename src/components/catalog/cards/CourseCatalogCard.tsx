import CatalogCardShell, {
  type CatalogCardLayoutProps,
} from "@/components/catalog/cards/CatalogCardShell";

/** Future course layout. No Course entity or builder in Phase 0. */
export default function CourseCatalogCard(props: CatalogCardLayoutProps) {
  return <CatalogCardShell {...props} />;
}
