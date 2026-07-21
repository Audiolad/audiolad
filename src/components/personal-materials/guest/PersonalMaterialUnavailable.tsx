export default function PersonalMaterialUnavailable() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f4fb] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-[#2f2647]">Материал недоступен</h1>
        <p className="mt-3 text-sm leading-6 text-[#6d628f]">
          Ссылка недействительна или доступ к материалу был отключён.
        </p>
        <p className="mt-2 text-sm leading-6 text-[#6d628f]">
          Обратитесь к автору, который отправил вам эту ссылку.
        </p>
        <p className="mt-8 text-xs text-[#9a91b8]">АудиоЛад</p>
      </div>
    </div>
  );
}
