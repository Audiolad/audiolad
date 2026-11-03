import { headers } from "next/headers";

import { buildCoffeePublicPageMetadata } from "@/lib/business-app/seo";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import BusinessHallHelp from "@/components/business-app/BusinessHallHelp";
import BusinessSupportDiagnosticPage from "@/components/business-app/BusinessSupportDiagnosticPage";
import { businessCabinetSide } from "@/lib/business-app/cabinet-mode";
import { loadBusinessCabinetMode } from "@/lib/business-app/cabinet-mode.server";
import { loadBusinessSupportDiagnostics } from "@/lib/business-app/load-support-diagnostics";

export default async function BusinessAppHelpPage() {
  // Hall device and the owner's preview of it: contacts and «Отключить это устройство» (cabinet-mode.ts).
  const cabinet = await loadBusinessCabinetMode();
  if (businessCabinetSide(cabinet.mode) === "venue") return <BusinessHallHelp />;
  const diagnostics = await loadBusinessSupportDiagnostics();
  return <BusinessSupportDiagnosticPage diagnostics={diagnostics} />;
}

export async function generateMetadata() {
  return buildCoffeePublicPageMetadata(getHostnameFromHeaders(await headers()), "/help", "Помощь – АудиоЛад Кофе", "Помощь с настройкой звучания кофейни и работой кабинета.");
}
