import FormattedPlainText from "@/components/FormattedPlainText";

type PersonalMaterialRecommendationProps = {
  recommendation: string;
};

export default function PersonalMaterialRecommendation({
  recommendation,
}: PersonalMaterialRecommendationProps) {
  return (
    <section className="rounded-2xl bg-[#f3edfc] p-5">
      <FormattedPlainText
        text={recommendation}
        className="text-sm leading-6 text-[#4f456c]"
        as="div"
      />
    </section>
  );
}
