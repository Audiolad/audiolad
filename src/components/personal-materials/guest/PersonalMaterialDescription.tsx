import FormattedPlainText from "@/components/FormattedPlainText";

type PersonalMaterialDescriptionProps = {
  description: string;
};

export default function PersonalMaterialDescription({
  description,
}: PersonalMaterialDescriptionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-[#2f2647]">О диагностике</h2>
      <FormattedPlainText
        text={description}
        className="text-sm leading-6 text-[#5f5484]"
        as="div"
      />
    </section>
  );
}
