import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Playfair_Display } from "next/font/google";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import BusinessAppShell from "@/components/business-app/BusinessAppShell";
import { BusinessDomainProvider } from "@/components/business-app/BusinessDomainProvider";
import "@/components/business-app/theme/business-theme.css";
import "@/components/business-app/business-app.css";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import {
  getHostnameFromHeaders,
  isBusinessHostname,
} from "@/lib/business-app/host";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";
import { BUSINESS_THEMES, resolveBusinessTheme } from "@/lib/business-app/theme";

export const metadata: Metadata = buildBusinessAppMetadata();

// One theme for every Business screen (21546de4); see src/lib/business-app/theme.ts.
const theme = resolveBusinessTheme();

// Same display serif as the public atlas (/b/atlas-kofeen), used for page titles only.
const businessDisplaySerif = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-biz-display",
});

export const viewport: Viewport = {
  themeColor: BUSINESS_THEMES[theme].themeColor,
};

export default async function BusinessAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const hostname = getHostnameFromHeaders(await headers());

  // Defense in depth: proxy already 404s /business-app on non-business hosts.
  if (!isBusinessHostname(hostname)) {
    notFound();
  }

  const domain = await loadBusinessOwnerHomeContext();

  return (
    <div
      className={`business-app-root ${businessDisplaySerif.variable}`}
      data-biz-theme={theme}
    >
      <BusinessDomainProvider value={domain}>
        <BusinessAppShell>{children}</BusinessAppShell>
      </BusinessDomainProvider>
    </div>
  );
}
