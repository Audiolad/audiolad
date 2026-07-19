import FormattedPlainText from "@/components/FormattedPlainText";
import type { ResolvedListeningNotice } from "@/lib/products/listening-notice";

type ListeningNoticeCardProps = {
  notice: ResolvedListeningNotice;
  variant?: "light" | "dark";
  className?: string;
};

const VARIANT_CLASSES = {
  light: {
    section:
      "mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5",
    title: "text-[17px] font-semibold",
    body: "mt-3 text-sm leading-6 text-[#7d70a2]",
  },
  dark: {
    section:
      "mt-8 rounded-[24px] border border-white/12 bg-white/8 px-5 py-5",
    title: "text-[17px] font-semibold",
    body: "mt-3 text-sm leading-6 text-white/70",
  },
} as const;

export default function ListeningNoticeCard({
  notice,
  variant = "light",
  className = "",
}: ListeningNoticeCardProps) {
  const styles = VARIANT_CLASSES[variant];

  return (
    <section className={`${styles.section} ${className}`.trim()}>
      <h2 className={styles.title}>{notice.title}</h2>
      <FormattedPlainText text={notice.text} className={styles.body} />
    </section>
  );
}
