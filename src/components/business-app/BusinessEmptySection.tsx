type BusinessEmptySectionProps = {
  title: string;
  description: string;
};

export default function BusinessEmptySection({
  title,
  description,
}: BusinessEmptySectionProps) {
  return (
    <section className="business-app-card mx-auto max-w-xl text-center">
      <h1 className="text-[1.45rem] font-bold tracking-tight text-[var(--biz-text)]">
        {title}
      </h1>
      <p className="mt-3 text-[1rem] leading-relaxed text-[var(--biz-text-muted)]">
        {description}
      </p>
      <p className="mt-5 text-sm text-[var(--biz-text-muted)]">
        Этот раздел появится в следующих обновлениях. Сейчас достаточно Главной.
      </p>
    </section>
  );
}
