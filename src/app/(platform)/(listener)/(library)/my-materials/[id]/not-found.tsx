import Link from "next/link";

export default function MyMaterialNotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-[#2f2647]">Материал недоступен</h1>
      <p className="mt-3 text-sm leading-6 text-[#6d628f]">
        Он был удалён или принадлежит другому пользователю.
      </p>
      <Link
        href="/my-materials"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
      >
        К списку материалов
      </Link>
    </div>
  );
}
