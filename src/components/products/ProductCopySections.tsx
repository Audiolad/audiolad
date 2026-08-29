import {
  resolveProductCopySections,
} from "@/lib/products/product-copy";

type ProductCopySectionsProps = {
  description?: string | null;
  seoAbout?: string | null;
  variant?: "desktop" | "compact";
};

export default function ProductCopySections({
  description,
  seoAbout,
  variant = "compact",
}: ProductCopySectionsProps) {
  const sections = resolveProductCopySections(description, seoAbout);
  const isDesktop = variant === "desktop";
  const headingClass = "text-lg font-semibold text-[#2b2140]";
  const bodyClass = isDesktop
    ? "mt-3 w-full max-w-none whitespace-pre-line text-[15px] leading-7 text-[#65577f]"
    : "mt-3 whitespace-pre-line text-[15px] leading-7 text-[#65577f]";
  const shortSectionClass = isDesktop
    ? "listener-practice-description mt-8 rounded-[26px] border border-[#eadff8] bg-white p-6 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
    : "mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]";
  const detailSectionClass = isDesktop
    ? "mt-6 rounded-[26px] border border-[#eadff8] bg-white p-6 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
    : "mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]";

  return (
    <>
      {sections.short ? (
        <section className={shortSectionClass}>
          <h2 className={headingClass}>{sections.short.heading}</h2>
          <p className={bodyClass}>{sections.short.text}</p>
        </section>
      ) : null}
      {sections.detail ? (
        <section className={detailSectionClass}>
          <h2 className={headingClass}>{sections.detail.heading}</h2>
          <p className={bodyClass}>{sections.detail.text}</p>
        </section>
      ) : null}
    </>
  );
}
