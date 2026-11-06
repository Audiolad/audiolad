import type { Metadata } from "next";

import PrivacyDocument from "@/components/legal/PrivacyDocument";
import LegalPageShell from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Политика обработки персональных данных – АудиоЛад",
  description:
    "Политика обработки и защиты персональных данных пользователей сайта «АудиоЛад».",
};

export default function PrivacyPage() {
  return <LegalPageShell><PrivacyDocument /></LegalPageShell>;
}
