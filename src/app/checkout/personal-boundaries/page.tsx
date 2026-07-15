import Link from "next/link";

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function CheckoutPage() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface pb-10">
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/practice/personal-boundaries"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <h1 className="text-lg font-semibold">Оформление покупки</h1>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-7 rounded-[26px] border border-[#eadff8] bg-white p-4 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <div className="flex gap-4">
              <div className="relative aspect-square w-[108px] shrink-0 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/50 bg-white/10 text-4xl text-white">
                    ◯
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#8c7dab]">
                  Энергопрактика
                </p>

                <h2 className="mt-2 text-[19px] font-semibold leading-6">
                  Мои личные границы
                </h2>

                <p className="mt-2 text-sm text-[#7042c5]">Сергей и Зоя</p>

                <p className="mt-2 text-sm text-[#7d70a2]">17 минут</p>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-[21px] font-semibold">Ваш заказ</h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-[#6f618d]">
                  Практика «Мои личные границы»
                </span>
                <span className="font-semibold">199 ₽</span>
              </div>

              <div className="border-t border-[#eee6f7]" />

              <div className="flex items-center justify-between px-5 py-4">
                <span className="font-semibold">Итого</span>
                <span className="text-[24px] font-semibold text-[#7042c5]">
                  199 ₽
                </span>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-[21px] font-semibold">Способ оплаты</h2>

            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between rounded-[22px] border-2 border-[#7042c5] bg-[#faf6ff] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7042c5] text-lg font-semibold text-white">
                    ₽
                  </span>

                  <div>
                    <p className="font-semibold">Банковская карта</p>
                    <p className="mt-1 text-xs text-[#7d70a2]">
                      Visa, Mastercard, Мир
                    </p>
                  </div>
                </div>

                <input
                  type="radio"
                  name="payment"
                  defaultChecked
                  className="h-5 w-5 accent-[#7042c5]"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-[22px] border border-[#eadff8] bg-white px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#edf7f2] text-sm font-semibold text-[#209a68]">
                    СБП
                  </span>

                  <div>
                    <p className="font-semibold">Система быстрых платежей</p>
                    <p className="mt-1 text-xs text-[#7d70a2]">
                      Оплата через приложение банка
                    </p>
                  </div>
                </div>

                <input
                  type="radio"
                  name="payment"
                  className="h-5 w-5 accent-[#7042c5]"
                />
              </label>
            </div>
          </section>

          <section className="mt-6 rounded-[22px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <div className="flex gap-3">
              <span className="mt-0.5 text-[#7042c5]">
                <LockIcon />
              </span>

              <div>
                <p className="font-semibold">Безопасная оплата</p>
                <p className="mt-2 text-sm leading-6 text-[#70628e]">
                  После оплаты практика появится в разделе «Мои практики».
                  Доступ к ней сохранится без ограничения по времени.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-7">
            <button
              type="button"
              className="w-full rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 text-[17px] font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)]"
            >
              Оплатить 199 ₽
            </button>

            <p className="mt-4 text-center text-xs leading-5 text-[#8a7ca9]">
              Нажимая кнопку, вы принимаете условия пользовательского
              соглашения и политики конфиденциальности.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}