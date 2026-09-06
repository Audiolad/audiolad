export default function AccessLinkNotFound() {
  return (
    <main className="min-h-dvh bg-[#f7f4fb] px-4 py-10">
      <div className="mx-auto w-full max-w-[560px] space-y-3 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-[#2f2647]">
          Ссылка недействительна
        </h1>
        <p className="text-sm leading-6 text-[#5c5278]">
          Эта ссылка доступа не существует или больше не действует.
        </p>
      </div>
    </main>
  );
}
