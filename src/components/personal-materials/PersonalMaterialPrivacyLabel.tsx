import PersonalMaterialLockIcon from "@/components/personal-materials/PersonalMaterialLockIcon";

type PersonalMaterialPrivacyLabelProps = {
  text: string;
  className?: string;
};

/** Compact privacy hint with closed lock — use on detail / page headers. */
export default function PersonalMaterialPrivacyLabel({
  text,
  className = "",
}: PersonalMaterialPrivacyLabelProps) {
  return (
    <p
      className={`inline-flex max-w-full items-center gap-1.5 text-sm text-[#6d628f] ${className}`}
    >
      <PersonalMaterialLockIcon className="h-3.5 w-3.5 shrink-0 text-[#7042c5]" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}
