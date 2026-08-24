"use client";

import BuyPracticeButton from "@/components/BuyPracticeButton";
import {
  isCatalogGlobalPlayerSession,
  type GlobalPlayerSession,
} from "@/lib/listen/global-player-types";

type PreviewEndedBuyCtaProps = {
  session: GlobalPlayerSession;
  className: string;
};

export default function PreviewEndedBuyCta({
  session,
  className,
}: PreviewEndedBuyCtaProps) {
  if (
    !isCatalogGlobalPlayerSession(session) ||
    session.playbackMode !== "preview" ||
    !session.previewCta ||
    session.previewCta.type !== "buy"
  ) {
    return null;
  }

  return (
    <BuyPracticeButton
      practiceSlug={session.productSlug}
      practiceId={session.practiceId}
      purchaseSurface="preview"
      label="Купить"
      hidePendingNotice
      signInReturnPath={session.previewCta.href}
      className={className}
    />
  );
}
