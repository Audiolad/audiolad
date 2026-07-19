import CatalogSearchFormClient from "@/components/catalog/CatalogSearchFormClient";

type CatalogSearchFormProps = {
  query: string;
  activeTopicKey: string | null;
};

export default function CatalogSearchForm({
  query,
  activeTopicKey,
}: CatalogSearchFormProps) {
  return (
    <CatalogSearchFormClient
      key={`${query}:${activeTopicKey ?? ""}`}
      initialQuery={query}
      activeTopicKey={activeTopicKey}
    />
  );
}
