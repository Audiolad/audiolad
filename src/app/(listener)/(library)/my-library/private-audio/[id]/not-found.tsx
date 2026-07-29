import Link from "next/link";

export default function PrivateAudioNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-1 py-10 text-center">
      <h1 className="text-2xl font-semibold text-[#25135c]">
        Материал не найден
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
        Возможно, он был удалён или вам недоступен.
      </p>
      <Link
        href="/my-practices?filter=uploads"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white"
      >
        К моим загрузкам
      </Link>
    </div>
  );
}
