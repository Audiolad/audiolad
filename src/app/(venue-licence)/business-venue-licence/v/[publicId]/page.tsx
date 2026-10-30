import type { Metadata } from "next";
import { notFound } from "next/navigation";

import VenueLicencePage, { VenueLicenceUnavailable } from "@/components/business-app/venue-licence/VenueLicencePage";
import { isVenueLicencePublicId } from "@/lib/business-app/host";
import { isVenueLicenceFixtureEnabled, isVenueLicencePublicEnabled } from "@/lib/business-app/venue-licence/flag";
import { loadVenueLicenceView } from "@/lib/business-app/venue-licence/load.server";
import type { VenueLicenceView } from "@/lib/business-app/venue-licence/present";
import { sampleVenueLicence } from "@/lib/business-app/venue-licence/samples";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Лицензия на публичное исполнение музыки в заведении – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ publicId: string }> };

export default async function BusinessVenueLicenceRoute({ params }: Props) {
  if (!isVenueLicencePublicEnabled()) notFound();
  const { publicId } = await params;
  if (!isVenueLicencePublicId(publicId)) notFound();
  if (isVenueLicenceFixtureEnabled()) {
    const sample = sampleVenueLicence(publicId);
    if (sample) return <VenueLicencePage view={sample} />;
  }
  let view: VenueLicenceView | null = null;
  let unavailable = false;
  try {
    view = await loadVenueLicenceView(publicId);
  } catch {
    unavailable = true;
  }
  if (unavailable) return <VenueLicenceUnavailable />;
  if (!view) notFound();
  return <VenueLicencePage view={view} />;
}
