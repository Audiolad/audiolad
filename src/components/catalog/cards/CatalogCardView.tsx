import AudiobookCatalogCard from "@/components/catalog/cards/AudiobookCatalogCard";
import CourseCatalogCard from "@/components/catalog/cards/CourseCatalogCard";
import PostCatalogCard from "@/components/catalog/cards/PostCatalogCard";
import PracticeCatalogCard from "@/components/catalog/cards/PracticeCatalogCard";
import ReleaseCatalogCard from "@/components/catalog/cards/ReleaseCatalogCard";
import type { CatalogCardLayoutProps } from "@/components/catalog/cards/CatalogCardShell";

export default function CatalogCardView(props: CatalogCardLayoutProps) {
  switch (props.card.class) {
    case "course":
      return <CourseCatalogCard {...props} />;
    case "audiobook":
      return <AudiobookCatalogCard {...props} />;
    case "release":
      return <ReleaseCatalogCard {...props} />;
    case "post":
      return <PostCatalogCard {...props} />;
    case "practice":
    default:
      return <PracticeCatalogCard {...props} />;
  }
}
