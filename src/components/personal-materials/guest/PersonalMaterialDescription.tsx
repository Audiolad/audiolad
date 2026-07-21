import FormattedPlainText from "@/components/FormattedPlainText";

type PersonalMaterialDescriptionProps = {
  description: string;
};

export default function PersonalMaterialDescription({
  description,
}: PersonalMaterialDescriptionProps) {
  return (
    <section>
      <FormattedPlainText
        text={description}
        className="text-sm leading-6 text-[#5f5484]"
        as="div"
      />
    </section>
  );
}
