export default function Home() {
  return (
    <main className="min-h-screen bg-[#fbf8ff] px-6 py-10 text-[#25135c]">
      <div className="mx-auto max-w-md">
        <header className="mb-10">
          <h1 className="text-4xl font-semibold">АудиоЛад</h1>

          <p className="mt-3 text-lg leading-7 text-[#68579b]">
            Медитации, энергопрактики и молитвы для любви, изобилия, счастья
          </p>
        </header>

        <section className="rounded-3xl border border-[#e8ddf7] bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-[#8a6bd1]">
            Первая рабочая версия
          </p>

          <h2 className="mt-3 text-2xl font-semibold">
            Добро пожаловать в АудиоЛад
          </h2>

          <p className="mt-3 leading-7 text-[#68579b]">
            Здесь появятся практики, программы, плейлисты и личная аудиотека.
          </p>

          <button
            type="button"
            className="mt-6 rounded-2xl bg-[#6f3dcc] px-6 py-3 font-medium text-white"
          >
            Слушать бесплатно
          </button>
        </section>
      </div>
    </main>
  );
}