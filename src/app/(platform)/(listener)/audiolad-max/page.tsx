import type { Metadata } from "next";
import Link from "next/link";

import { articleBodyClass } from "@/components/articles/typography";
import JsonLdScript from "@/components/seo/JsonLdScript";
import { AUDIOLAD_MAX_BOT_URL } from "@/lib/max/startapp";
import { AUDIOLAD_MAX_ARTICLE as article } from "@/lib/seo/articles/audiolad-max";
import { buildBreadcrumbListJsonLd } from "@/lib/seo/json-ld";
import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";

const canonical = buildSiteCanonicalUrl(article.path);

export const metadata: Metadata = {
  title: article.title,
  description: article.description,
  alternates: { canonical },
  openGraph: {
    type: "article",
    title: article.title,
    description: article.description,
    url: canonical,
    locale: "ru_RU",
    publishedTime: article.publishedAt,
  },
};

const linkClass = "font-medium text-[#7042c5] underline underline-offset-2";
const launchClass =
  "inline-flex rounded-full bg-[#7042c5] px-5 py-3 font-semibold text-white hover:bg-[#5e36aa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";
const headingClass = "text-2xl font-semibold tracking-tight text-[#25135c]";

export default function AudioladMaxPage() {
  const breadcrumb = buildBreadcrumbListJsonLd([
    { name: "Главная", path: "/" },
    { name: "Статьи", path: "/articles" },
    { name: article.breadcrumbTitle, path: article.path },
  ]);

  return (
    <article className="mx-auto max-w-[40rem] space-y-8 pb-10 pt-3 xl:pt-2">
      <JsonLdScript data={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        description: article.description,
        datePublished: article.publishedAt,
        inLanguage: "ru-RU",
        mainEntityOfPage: canonical,
        author: { "@type": "Organization", name: "АудиоЛад", url: buildSiteCanonicalUrl() },
      }} />
      <JsonLdScript data={breadcrumb} />

      <header className="space-y-4">
        <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]">
          <Link href="/articles" className={linkClass}>Статьи</Link>
        </nav>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[#25135c] sm:text-3xl">
          {article.title}
        </h1>
        <p className={articleBodyClass}>
          Мы запустили мини-приложение АудиоЛад в мессенджере MAX. В нём можно открыть
          каталог и слушать музыку, медитации и аудиопрактики прямо в мессенджере.
          Если вы искали «АудиоЛад Макс», вот прямая ссылка.
        </p>
        <a href={AUDIOLAD_MAX_BOT_URL} className={launchClass}>Открыть АудиоЛад в MAX</a>
      </header>

      <section aria-labelledby="open-audiolad" className="space-y-4">
        <h2 id="open-audiolad" className={headingClass}>Как открыть АудиоЛад в MAX</h2>
        <ol className={`list-decimal space-y-2 pl-6 ${articleBodyClass}`}>
          <li>Перейдите по ссылке выше. Она ведёт в чат АудиоЛада в MAX.</li>
          <li>Нажмите кнопку запуска мини-приложения в чате.</li>
          <li>Выберите, что хотите послушать, и нажмите «Воспроизвести».</li>
        </ol>
        <p className={articleBodyClass}>
          Если ссылка открылась в браузере, воспользуйтесь предложением перейти в MAX.
          А если вы уже в мессенджере, ссылку можно отправить себе в «Избранное» и открыть оттуда.
        </p>
      </section>

      <section aria-labelledby="save-audiolad" className="space-y-4">
        <h2 id="save-audiolad" className={headingClass}>Как сохранить АудиоЛад под рукой</h2>
        <p className={articleBodyClass}>
          <strong>В «Избранном».</strong> Скопируйте ссылку на АудиоЛад и отправьте её
          себе в чат «Избранное». Чтобы найти его, откройте «Чаты» и введите «Избранное»
          в строке поиска.{" "}
          <a className={linkClass} href="https://help.max.ru/help/messages/nastroiki_chatov/kak_naiti_izbrannoe">
            Справка MAX об «Избранном»
          </a>
        </p>
        <p className={articleBodyClass}>
          <strong>В папке с чатами.</strong> Если чат АудиоЛада уже появился в списке,
          добавьте его в подходящую папку. Новую папку, например «Слушать», можно создать
          в разделе «Настройки» → «Папки» и выбрать там чат АудиоЛада.{" "}
          <a className={linkClass} href="https://help.max.ru/help/folders/nastroiki_papok/kak_sozdat_novuyu_papku_dlya_chatov">
            Справка MAX о папках
          </a>
        </p>
        <p className={articleBodyClass}>
          Так в следующий раз АудиоЛад можно будет открыть из «Избранного» или папки в MAX.
        </p>
        <a href={AUDIOLAD_MAX_BOT_URL} className={launchClass}>Перейти в АудиоЛад в MAX</a>
      </section>
    </article>
  );
}
