import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import BaseProviders from "@/components/providers/BaseProviders";
import {
  PLATFORM_LIGHT_THEME_COLOR,
} from "@/lib/navigation/bottom-nav";
import { getHostBrandMetadata } from "@/lib/business-app/brand-icons";
import { isBusinessHostname } from "@/lib/business-app/host";
import { getHostnameFromHeaders } from "@/lib/school/host";
import { getAppOriginUrl } from "@/lib/seo/app-origin";
import {
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
  SITE_BRAND,
} from "@/lib/seo/site-copy";

import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PLATFORM_LIGHT_THEME_COLOR,
};

const baseMetadata: Metadata = {
  metadataBase: getAppOriginUrl(),
  title: HOME_SEO_TITLE,
  description: HOME_SEO_DESCRIPTION,
  applicationName: SITE_BRAND,
  appleWebApp: {
    capable: true,
    title: SITE_BRAND,
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const hostname = getHostnameFromHeaders(await headers());
  const brand = getHostBrandMetadata(hostname);
  if (isBusinessHostname(hostname)) {
    return {
      ...baseMetadata,
      ...brand,
      applicationName: "АудиоЛад Бизнес",
      appleWebApp: {
        capable: true,
        title: "АудиоЛад Бизнес",
        statusBarStyle: "default",
      },
    };
  }
  return { ...baseMetadata, ...brand };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hostname = getHostnameFromHeaders(await headers());
  const isBusinessHost = isBusinessHostname(hostname);

  return (
    <html lang="ru" className="bg-platform-surface">
      <body className="min-h-dvh bg-platform-surface text-[#25135c] antialiased">
        {isBusinessHost ? children : <BaseProviders>{children}</BaseProviders>}
      </body>
    </html>
  );
}
