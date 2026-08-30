import {
  resolveProductCopySections,
} from "@/lib/products/product-copy";

type ProductCopySectionsProps = {
  description?: string | null;
  variant?: "desktop" | "compact";
};

export default function ProductCopySections({
  description,
  variant = "compact",
}: ProductCopySectionsProps) {
  const sections = resolveProductCopySections(description);
  if (!sections.about) {
    return null;
  }

  const isDesktop = variant === "desktop";
  const headingClass = "text-lg font-semibold text-[#2b2140]";
  const bodyClass = isDesktop
    ? "mt-3 w-full max-w-none whitespace-pre-line text-[15px] leading-7 text-[#65577f]"
    : "mt-3 whitespace-pre-line text-[15px] leading-7 text-[#65577f]";
  const sectionClass = isDesktop
    ? "listener-practice-description mt-8 rounded-[26px] border border-[#eadff8] bg-white p-6 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
    : "mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]";

  return (
    <section className={sectionClass}>
      <h2 className={headingClass}>{sections.about.heading}</h2>
      <p className={bodyClass}>{sections.about.text}</p>
    </section>
  );
}
