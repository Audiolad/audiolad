import Link from "next/link";

export default function AdminForbidden() {
  return (
    <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-6">
      <h2 className="text-[21px] font-semibold text-[#25135c]">
        Недостаточно прав
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#796ba0]">
        У вашей роли нет доступа к этому разделу панели управления.
      </p>
      <Link
        href="/admin"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[14px] bg-[#7042c5] px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Вернуться к панели
      </Link>
    </div>
  );
}
