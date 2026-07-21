import FormattedPlainText from "@/components/FormattedPlainText";

type PersonalMaterialRecommendationProps = {
  recommendation: string;
};

export default function PersonalMaterialRecommendation({
  recommendation,
}: PersonalMaterialRecommendationProps) {
  return (
    <section className="rounded-2xl bg-[#f3edfc] p-5">
      <div className="mb-3 flex items-center gap-2">
        <span aria-hidden="true" className="text-lg">
          ✦
        </span>
        <h2 className="text-base font-semibold text-[#2f2647]">Персональная рекомендация</h2>
      </div>
      <FormattedPlainText
        text={recommendation}
        className="text-sm leading-6 text-[#4f456c]"
        as="div"
      />
    </section>
  );
}
