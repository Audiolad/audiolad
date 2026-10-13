import BusinessEmptySection from "@/components/business-app/BusinessEmptySection";
import { BUSINESS_RIGHTS_DOCUMENTS_EMPTY } from "@/lib/business-app/rights-status-copy";

export default function BusinessAppDocumentsPage() {
  return (
    <BusinessEmptySection
      title={BUSINESS_RIGHTS_DOCUMENTS_EMPTY.title}
      description={BUSINESS_RIGHTS_DOCUMENTS_EMPTY.description}
    />
  );
}
