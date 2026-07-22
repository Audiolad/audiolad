import Image from "next/image";

import PersonalMaterialReturnChatCta from "@/components/personal-materials/PersonalMaterialReturnChatCta";
import PersonalMaterialAudioPlayer from "@/components/personal-materials/guest/PersonalMaterialAudioPlayer";
import PersonalMaterialPdfDocument from "@/components/personal-materials/PersonalMaterialPdfDocument";
import PersonalMaterialDescription from "@/components/personal-materials/guest/PersonalMaterialDescription";
import PersonalMaterialGuestFooter from "@/components/personal-materials/guest/PersonalMaterialGuestFooter";
import PersonalMaterialHeader from "@/components/personal-materials/guest/PersonalMaterialHeader";
import PersonalMaterialRecommendation from "@/components/personal-materials/guest/PersonalMaterialRecommendation";
import PersonalMaterialSaveCta from "@/components/personal-materials/guest/PersonalMaterialSaveCta";
import { shouldRenderOptionalBlock } from "@/lib/personal-materials/access";
import {
  formatGuestMaterialDate,
  getGuestDisplayTitle,
  getGuestGreeting,
} from "@/lib/personal-materials/guest/display";
import type { PersonalMaterialGuestPageProps } from "@/lib/personal-materials/guest/types";

export default function PersonalMaterialGuestPage({
  material,
  apiPaths,
  isAuthenticated,
  claimCompletePath,
}: PersonalMaterialGuestPageProps) {
  const displayTitle = getGuestDisplayTitle(material.title, material.materialType);
  const greeting = getGuestGreeting(material.clientFirstName);
  const preparedLabel = formatGuestMaterialDate(material.materialDate);

  return (
    <div className="min-h-dvh bg-[#f7f4fb] px-4 py-6 pb-10 sm:py-10">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Image
            src="/brand/audiolad-logo-horizontal.png"
            alt="АудиоЛад"
            width={140}
            height={32}
            className="h-8 w-auto"
            priority
          />
          <p className="text-xs font-medium uppercase tracking-wide text-[#9a91b8]">
            Персональный материал
          </p>
        </div>

        <article className="space-y-6 rounded-3xl bg-white p-5 shadow-sm sm:p-8">
          <PersonalMaterialHeader
            authorName={material.author.name}
            authorAvatarUrl={material.author.avatarUrl}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-[#7042c5]">{greeting}</p>
            <h1 className="break-words text-2xl font-semibold leading-tight text-[#2f2647] sm:text-[28px]">
              {displayTitle}
            </h1>
            <p className="text-sm text-[#6d628f]">{preparedLabel}</p>
          </div>

          <PersonalMaterialAudioPlayer
            materialId={material.id}
            audioApiPath={apiPaths.audio}
            enabled={material.hasAudio}
          />

          {material.hasPdf ? (
            <PersonalMaterialPdfDocument
              pdfOpenPath={apiPaths.pdfOpen}
              filename={material.pdfOriginalFilename}
            />
          ) : null}

          {shouldRenderOptionalBlock(material.description) && (
            <PersonalMaterialDescription description={material.description} />
          )}

          {shouldRenderOptionalBlock(material.personalRecommendation) && (
            <PersonalMaterialRecommendation
              recommendation={material.personalRecommendation}
            />
          )}

          <PersonalMaterialSaveCta
            isAuthenticated={isAuthenticated}
            claimApiPath={apiPaths.claim}
            claimContextApiPath={apiPaths.claimContext}
            claimCompletePath={claimCompletePath}
            materialId={material.id}
            clientFirstName={material.clientFirstName}
            clientLastName={material.clientLastName}
          />

          <PersonalMaterialReturnChatCta
            returnUrl={material.returnUrl}
            returnButtonLabel={material.returnButtonLabel}
          />

          <PersonalMaterialGuestFooter />
        </article>
      </div>
    </div>
  );
}
