import {
  resolveProductCopySections,
} from "@/lib/products/product-copy";

type ProductCopySectionsProps = {
  description?: string | null;
};

export default function ProductCopySections({
  description,
}: ProductCopySectionsProps) {
  const sections = resolveProductCopySections(description);
  if (!sections.about) {
    return null;
  }

  const headingClass = "text-lg font-semibold text-[#2b2140]";
  const bodyClass =
    "mt-3 whitespace-pre-line text-[15px] leading-7 text-[#65577f] xl:w-full xl:max-w-none";
  const sectionClass =
    "listener-practice-description mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)] xl:mt-8 xl:p-6";

  return (
    <section className={sectionClass}>
      <h2 className={headingClass}>{sections.about.heading}</h2>
      <p className={bodyClass}>{sections.about.text}</p>
    </section>
  );
}
