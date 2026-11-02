import { headers } from "next/headers";

import { buildCoffeePublicPageMetadata } from "@/lib/business-app/seo";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import BusinessSupportDiagnosticPage from "@/components/business-app/BusinessSupportDiagnosticPage";
import { loadBusinessSupportDiagnostics } from "@/lib/business-app/load-support-diagnostics";

export default async function BusinessAppHelpPage() {
  const diagnostics = await loadBusinessSupportDiagnostics();
  return <BusinessSupportDiagnosticPage diagnostics={diagnostics} />;
}

export async function generateMetadata() {
  return buildCoffeePublicPageMetadata(getHostnameFromHeaders(await headers()), "/help", "Помощь – АудиоЛад Кофе", "Помощь с настройкой звучания кофейни и работой кабинета.");
}
