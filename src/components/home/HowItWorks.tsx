const STEPS = [
  {
    title: "Найдите подходящее аудио",
    description: "Откройте каталог и выберите практику или программу по теме.",
  },
  {
    title: "Слушайте бесплатные материалы сразу",
    description: "Бесплатные практики доступны без регистрации – можно начать в любой момент.",
  },
  {
    title: "Создайте аккаунт для личного пространства",
    description:
      "Сохраняйте прогресс, собирайте плейлисты и открывайте новые программы в Аудиотеке.",
  },
] as const;

export default function HowItWorks() {
  return (
    <section className="mt-8" aria-label="Как работает АудиоЛад">
      <h2 className="text-[22px] font-semibold leading-tight text-[#25135c]">
        Как работает АудиоЛад
      </h2>

      <ol className="mt-4 space-y-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4ecfb] text-sm font-semibold text-[#7042c5]"
            >
              {index + 1}
            </span>

            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold text-[#25135c]">
                {step.title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#7d70a2]">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
