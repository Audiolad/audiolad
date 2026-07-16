import type { Metadata, Viewport } from "next";

import AppProviders from "@/components/AppProviders";
import {
  PLATFORM_LIGHT_THEME_COLOR,
} from "@/lib/navigation/bottom-nav";
import { getAppOriginUrl } from "@/lib/seo/app-origin";

import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PLATFORM_LIGHT_THEME_COLOR,
};

export const metadata: Metadata = {
  metadataBase: getAppOriginUrl(),
  title: "АудиоЛад",
  description: "Платформа аудиопрактик, медитаций и энергетических программ",
  applicationName: "АудиоЛад",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "АудиоЛад",
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="bg-platform-surface">
      <body className="min-h-dvh bg-platform-surface text-[#25135c] antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
