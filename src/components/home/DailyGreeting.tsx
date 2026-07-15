type DailyGreetingProps = {
  title: string;
  phrase: string;
};

export default function DailyGreeting({ title, phrase }: DailyGreetingProps) {
  return (
    <section
      className="mt-6 rounded-[24px] border border-[#eadff8] bg-gradient-to-r from-[#faf4ff] to-[#f5edfc] px-5 py-4"
      aria-label="Персональное приветствие"
    >
      <h1 className="text-[22px] font-semibold leading-tight text-[#25135c] lg:text-[24px]">
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-[#6f61a3]">
        <em>{phrase}</em>
      </p>
    </section>
  );
}
