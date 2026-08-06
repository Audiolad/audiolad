"use client";

type HistoryErrorProps = {
  reset: () => void;
};

export default function HistoryError({ reset }: HistoryErrorProps) {
  return (
    <div className="mt-16 text-center">
        <p className="text-sm leading-6 text-[#796ba0]">
          Не удалось загрузить историю.
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
  );
}
