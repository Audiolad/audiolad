import BusinessSupportDiagnosticPage from "@/components/business-app/BusinessSupportDiagnosticPage";
import { loadBusinessSupportDiagnostics } from "@/lib/business-app/load-support-diagnostics";

export default async function BusinessAppHelpPage() {
  const diagnostics = await loadBusinessSupportDiagnostics();
  return <BusinessSupportDiagnosticPage diagnostics={diagnostics} />;
}
