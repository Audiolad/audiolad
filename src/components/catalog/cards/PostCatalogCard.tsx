import CatalogCardShell, {
  type CatalogCardLayoutProps,
} from "@/components/catalog/cards/CatalogCardShell";

export default function PostCatalogCard(props: CatalogCardLayoutProps) {
  return <CatalogCardShell {...props} />;
}
