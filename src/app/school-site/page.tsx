import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import SchoolFirstScreen from "@/components/school/SchoolFirstScreen";
import SchoolSecondScreen from "@/components/school/SchoolSecondScreen";
import SchoolThirdScreen from "@/components/school/SchoolThirdScreen";
import SchoolFourthScreen from "@/components/school/SchoolFourthScreen";
import SchoolFifthScreen from "@/components/school/SchoolFifthScreen";
import SchoolVoiceReachScreen from "@/components/school/SchoolVoiceReachScreen";
import SchoolLegacyScreen from "@/components/school/SchoolLegacyScreen";
import SchoolInnerProductScreen from "@/components/school/SchoolInnerProductScreen";
import SchoolAudienceScreen from "@/components/school/SchoolAudienceScreen";
import SchoolWhyNowScreen from "@/components/school/SchoolWhyNowScreen";
import SchoolProgramScreen from "@/components/school/SchoolProgramScreen";
import SchoolResultsScreen from "@/components/school/SchoolResultsScreen";
import SchoolAuthorScreen from "@/components/school/SchoolAuthorScreen";
import SchoolLearningProcessScreen from "@/components/school/SchoolLearningProcessScreen";
import SchoolTariffsScreen from "@/components/school/SchoolTariffsScreen";
import SchoolBonusesScreen from "@/components/school/SchoolBonusesScreen";
import {
  getHostnameFromHeaders,
  isMainSiteHostname,
} from "@/lib/school/host";
import { buildSchoolLandingMetadata } from "@/lib/school/seo";

export const metadata: Metadata = buildSchoolLandingMetadata();

export default async function SchoolSitePage() {
  const hostname = getHostnameFromHeaders(await headers());

  // Defense in depth: proxy already 404s on apex; keep page-level guard too.
  if (isMainSiteHostname(hostname)) {
    notFound();
  }

  return (
    <main>
      <SchoolFirstScreen />
      <SchoolSecondScreen />
      <SchoolThirdScreen />
      <SchoolFourthScreen />
      <SchoolFifthScreen />
      <SchoolVoiceReachScreen />
      <SchoolLegacyScreen />
      <SchoolInnerProductScreen />
      <SchoolAudienceScreen />
      <SchoolWhyNowScreen />
      <SchoolProgramScreen />
      <SchoolResultsScreen />
      <SchoolAuthorScreen />
      <SchoolLearningProcessScreen />
      <SchoolTariffsScreen />
      <SchoolBonusesScreen />
    </main>
  );
}
