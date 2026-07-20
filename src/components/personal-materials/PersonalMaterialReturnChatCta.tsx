import {
  getGuestReturnButtonLabel,
  shouldShowGuestReturnChatButton,
} from "@/lib/personal-materials/return-url";

type PersonalMaterialReturnChatCtaProps = {
  returnUrl: string | null;
  returnButtonLabel: string | null;
};

export default function PersonalMaterialReturnChatCta({
  returnUrl,
  returnButtonLabel,
}: PersonalMaterialReturnChatCtaProps) {
  if (!shouldShowGuestReturnChatButton({ returnUrl })) {
    return null;
  }

  const label = getGuestReturnButtonLabel({ returnButtonLabel });

  return (
    <a
      href={returnUrl ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 w-full items-center justify-center break-words rounded-full border border-[#c6afe6] px-5 py-3 text-center text-sm font-semibold text-[#7042c5]"
    >
      {label}
    </a>
  );
}
