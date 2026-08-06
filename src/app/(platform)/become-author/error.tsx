"use client";

import BecomeAuthorShell from "@/components/become-author/BecomeAuthorShell";

type BecomeAuthorErrorProps = {
  reset: () => void;
};

export default function BecomeAuthorError({ reset }: BecomeAuthorErrorProps) {
  return (
    <BecomeAuthorShell>
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-5 py-10 text-center">
        <h1 className="text-[28px] font-semibold">Стать автором</h1>

        <p className="mt-6 text-sm leading-6 text-[#796ba0] lg:max-w-md">
          Не удалось загрузить страницу.
          <br />
          Попробуйте ещё раз.
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-11 rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Попробовать снова
        </button>
      </div>
    </BecomeAuthorShell>
  );
}
