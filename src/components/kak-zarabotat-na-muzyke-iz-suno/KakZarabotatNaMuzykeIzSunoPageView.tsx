import Link from "next/link";
import type { ReactNode } from "react";

import AiMusicIntroCta from "@/components/ai-music/AiMusicIntroCta";
import ArticleFaqList from "@/components/articles/ArticleFaqList";
import { articleBodyStackClass } from "@/components/articles/typography";
import {
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_BREADCRUMB_TITLE,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1,
} from "@/lib/seo/kak-zarabotat-na-muzyke-iz-suno";

const heading = "scroll-mt-24 text-2xl font-semibold tracking-tight text-[#25135c] sm:text-3xl";
const section = "mt-14 max-w-3xl sm:mt-20";
const linkClass = "font-medium text-[#7042c5] underline decoration-[#c9b6ea] underline-offset-4 hover:text-[#56318f]";
const visual = "mt-8 overflow-hidden rounded-[24px] border border-[#d8c8ee] bg-gradient-to-br from-[#fffaff] to-[#efe4fb] p-5 text-[#4a3d73] shadow-[0_12px_30px_rgba(90,60,145,0.08)] sm:p-7";
const card = "rounded-2xl border border-white/80 bg-white/85 px-3 py-3 text-center text-sm font-medium shadow-sm";

function Visual({ number, caption, children }: { number: string; caption: string; children: ReactNode }) {
  return <figure className={visual} data-visual-block={number}>{children}<figcaption className="mt-5 text-sm leading-6 text-[#6f6291]">{caption}</figcaption></figure>;
}

function MonetizationFunnelVisual() {
  const items = ["ТРЕК ИЗ СУНО", "ПРАВА", "МОДЕЛЬ", "ПЛОЩАДКА", "АУДИТОРИЯ", "ДОХОД"];
  return <Visual number="1" caption="Заработок появляется не в момент генерации, а когда у трека есть права, понятная модель монетизации и путь к слушателю или покупателю."><div className="grid gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">{items.map((item, index) => <div key={item} className={index === 0 || index === 5 ? "rounded-2xl bg-[#7042c5] px-3 py-3 text-sm font-semibold text-white" : card}>{item}</div>)}</div></Visual>;
}

function ModelCardsVisual() {
  const cards = [
    ["СТРИМИНГИ", "Дистрибуция и выплаты за прослушивания"],
    ["ПРОДАЖА", "Самостоятельная продажа треков и альбомов"],
    ["НА ЗАКАЗ", "Музыка под задачу клиента"],
    ["ЛИЦЕНЗИИ", "Разрешённый сценарий использования"],
    ["YOUTUBE", "Собственный контент и монетизация канала"],
    ["БИЗНЕС", "Фон для пространств при подходящих правах"],
  ];
  return <Visual number="2" caption="Один каталог музыки из Суно может сочетать несколько моделей, если права и условия площадок это позволяют."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([title, text]) => <div key={title} className={card}><b>{title}</b><br /><span className="font-normal">{text}</span></div>)}</div></Visual>;
}

function RightsChecklistVisual() {
  const cards = [
    ["ТАРИФ", "Free/Basic или Pro/Premier"],
    ["СКАЧИВАНИЕ", "Permitted download через канал Суно"],
    ["ИСХОДНИКИ", "Тексты, сэмплы, загруженное аудио"],
    ["ПЛОЩАДКА", "Правила дистрибьютора или сервиса"],
    ["МОДЕЛЬ", "Что именно вы продаёте или лицензируете"],
  ];
  return <Visual number="3" caption="Перед монетизацией проверьте тариф, факт разрешённого скачивания, исходные материалы и правила выбранной площадки."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([title, text]) => <div key={title} className={card}><b>{title}</b><br /><span className="font-normal">{text}</span></div>)}</div></Visual>;
}

function StarterPathVisual() {
  const items = ["ПРАВА", "НИША", "УПАКОВКА", "ПУБЛИКАЦИЯ", "ОТКЛИК"];
  return <Visual number="4" caption="Новичку проще начать с одной ниши и одной модели, а затем развивать то, что получает реальный отклик."><div className="grid gap-2 text-center sm:grid-cols-5">{items.map((item, index) => <div key={item} className={index === 4 ? "rounded-2xl bg-[#7042c5] px-3 py-3 text-sm font-semibold text-white" : card}>{item}</div>)}</div></Visual>;
}

export default function KakZarabotatNaMuzykeIzSunoPageView() {
  return <article className="pb-16 pt-4">
    <nav aria-label="Хлебные крошки" className="text-sm text-[#7d70a2]"><ol className="flex flex-wrap gap-1.5"><li><Link href="/" className={linkClass}>Главная</Link></li><li>→</li><li><Link href="/for-authors" className={linkClass}>Авторам</Link></li><li>→</li><li aria-current="page">{KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_BREADCRUMB_TITLE}</li></ol></nav>
    <header className="mt-8 max-w-3xl sm:mt-10"><h1 className="text-[1.85rem] font-semibold leading-tight tracking-tight text-[#25135c] sm:text-4xl">{KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1}</h1><div className={`mt-7 ${articleBodyStackClass}`}>
      <p>Музыку в Суно (Suno) можно создать за несколько минут. Но между готовым треком и реальным заработком есть ещё один этап: нужно понять, что именно вы собираетесь продавать и кто готов за это платить.</p>
      <p>Заработок на Суно – это не одна схема. Один автор развивает стриминги, другой продаёт готовые композиции, третий делает музыку на заказ, четвёртый лицензирует фон для видео и аудиопрактик, пятый собирает каталог в АудиоЛаде.</p>
      <p>Суно становится инструментом производства музыки. Доход появляется позже: когда есть коммерческие права на конкретный трек, понятная аудитория или покупатель и выбранная модель монетизации.</p>
      <p>Если композиция ещё не создана, начните с материала <Link href="/kak-sozdat-muzyku-v-suno" className={linkClass}>как создать музыку в Суно</Link>. Если нужно сначала понять, куда публиковать готовый трек, посмотрите <Link href="/kuda-vykladyvat-muzyku-iz-suno" className={linkClass}>куда выкладывать музыку из Суно</Link>.</p>
    </div></header>
    <MonetizationFunnelVisual />
    <section className={section}><h2 className={heading}>1. Сначала проверьте коммерческие права</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Это обязательный шаг перед любым заработком. В актуальных <a href="https://suno.com/terms" className={linkClass} target="_blank" rel="noopener noreferrer">условиях Suno</a> указано: результаты Free или Basic предназначены только для законного личного некоммерческого использования. Для пользователя Pro или Premier сервис назначает права на Output, а коммерческое использование разрешено для Output, скачанных через предусмотренный канал загрузки.</p>
      <p>В <a href="https://help.suno.com/en/articles/9601665" className={linkClass} target="_blank" rel="noopener noreferrer">справке Suno о коммерческом использовании</a> сказано: песни, скачанные во время платной подписки, получают коммерческие права. Их можно монетизировать, распространять через стриминговые сервисы, использовать в фильмах, ТВ или играх и продавать самостоятельно. При этом Suno не заявляет долю в вашем доходе от такой монетизации. Из-за машинного обучения сервис не гарантирует, что на Output автоматически возникнет защита авторским правом.</p>
      <p><a href="https://help.suno.com/en/articles/2425729" className={linkClass} target="_blank" rel="noopener noreferrer">Справка Suno о правах на созданную музыку</a> поясняет: переход на Pro или Premier после создания трека на бесплатном тарифе по умолчанию не даёт коммерческие права задним числом. По <a href="https://help.suno.com/en/articles/13876865" className={linkClass} target="_blank" rel="noopener noreferrer">справке о downloads</a>, у Pro 20 download credits в месяц, у Premier – 60; trial downloads на Free не предназначены для коммерческого использования. Не удаляйте fingerprint, watermark или metadata, которые сервис добавляет к Output.</p>
    </div></section>
    <RightsChecklistVisual />
    <section className={section}><h2 className={heading}>2. Доход от прослушиваний и стримингов</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Если цель – присутствие на Spotify, Apple Music и других сервисах, музыку из Суно обычно отправляют <b>через музыкального дистрибьютора</b>. Даже при коммерческих правах дистрибьютор и площадка могут иметь собственные требования к ИИ-контенту.</p>
      <p>Стриминговый доход редко становится быстрым источником денег на одном-двух треках. Важнее регулярный каталог, понятная ниша и аудитория, которая реально слушает релизы. Подробный маршрут дистрибуции разобран в статье <Link href="/distribyutor-ii-muzyki" className={linkClass}>дистрибьютор ИИ-музыки</Link>.</p>
    </div></section>
    <ModelCardsVisual />
    <section className={section}><h2 className={heading}>3. Продажа готовых композиций</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Самостоятельная продажа – один из прямых ответов на вопрос, как продавать музыку из Суно. Покупателю нужен не безымянный файл, а понятный продукт: сингл, альбом, тематическая коллекция или музыка под сценарий.</p>
      <p>Чем яснее назначение, настроение и аудитория, тем проще объяснить цену. Если главная задача именно продажа, а не обзор всех моделей, перейдите к материалу <Link href="/kak-prodat-muzyku-sozdannuyu-ii" className={linkClass}>как продать музыку, созданную ИИ</Link>.</p>
    </div></section>
    <section className={section}><h2 className={heading}>4. Музыка на заказ</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Клиенту может быть нужна не готовая композиция из каталога, а трек под конкретную задачу: фон для ролика, тема подкаста, музыка для презентации или короткого фильма. Здесь Суно ускоряет производство, но продаётся результат под бриф, а не «кнопка Create».</p>
      <p>Важно заранее согласовать объём прав, срок, правки и то, что именно получает заказчик после оплаты.</p>
    </div></section>
    <section className={section}><h2 className={heading}>5. Лицензирование</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Лицензирование отличается от продажи экземпляра. Покупателю или партнёру передаётся <b>разрешённый сценарий использования</b>: фон в видео, медитации, курсе, рекламном ролике или приложении.</p>
      <p>Не обещайте объём прав, которого нет у вас по условиям Суно, исходным материалам или выбранной площадке. Один инструментальный трек может работать в нескольких лицензионных сценариях, если условия совместимы.</p>
    </div></section>
    <section className={section}><h2 className={heading}>6. Собственный YouTube и контент</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Музыку из Суно можно использовать в собственных роликах, визуализациях и тематических подборках, если права это допускают. Тогда источник дохода – не только «продажа файла», а развитие канала, аудитории и связанных форматов.</p>
      <p>Для монетизируемого контента снова проверьте коммерческие права, исходники и правила платформы. Отказ третьей площадки не отменяет то, что разрешил сервис генерации, но именно площадка решает, можно ли сделать выбранное использование у себя.</p>
    </div></section>
    <section className={section}><h2 className={heading}>7. Музыка для бизнеса</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Отдельное направление – фон для кафе, салонов, студий и других пространств. Здесь недостаточно просто скачать композицию и передать её заведению. Нужны коммерческие права и понимание условий публичного воспроизведения.</p>
      <p>Такую музыку разумнее оформлять как продукт с понятными условиями использования, а не как разовую передачу файла.</p>
    </div></section>
    <section className={section}><h2 className={heading}>8. Публикация в АудиоЛаде</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>В АудиоЛаде музыку из Суно можно оформить как самостоятельный музыкальный продукт: название, обложка, описание, жанр, настроение и сценарий использования. Отдельные композиции собираются в альбомы и тематические каталоги.</p>
      <p>Это удобно для фоновой и функциональной музыки, которую ищут не по имени исполнителя, а по задаче: чтение, работа, отдых, массаж, кафе. Модель площадки подробнее описана в материале <Link href="/kak-zarabatyvat-na-ii-muzyke-v-audiolad" className={linkClass}>как зарабатывать на своей ИИ-музыке в АудиоЛаде</Link>.</p>
    </div></section>
    <section className={section}><h2 className={heading}>9. Несколько способов заработка сразу</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Один трек при совместимых правах может участвовать в нескольких каналах: стриминги, продажа альбома, лицензия для автора контента и пример для заказчиков. Но каждый канал нужно проверять отдельно.</p>
      <p>Общий обзор моделей без привязки только к Суно есть в статье <Link href="/mozhno-li-zarabotat-na-ii-muzyke" className={linkClass}>можно ли заработать на ИИ-музыке</Link>.</p>
    </div></section>
    <section className={section}><h2 className={heading}>10. Нужно ли создавать много треков</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Один случайный хит редко закрывает задачу. Обычно устойчивее каталог в понятной нише: несколько сильных композиций под одну аудиторию и один сценарий использования.</p>
      <p>При этом качество и упаковка важнее сырого количества. Лучше десять понятных треков с правами и метаданными, чем сотня файлов без сценария монетизации.</p>
    </div></section>
    <section className={section}><h2 className={heading}>11. Сколько можно заработать</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Фиксированной цифры нет. Доход зависит от прав, ниши, канала, спроса, упаковки и того, приходит ли слушатель или покупатель. Обещать «лёгкие деньги» или гарантированный доход нельзя.</p>
      <p>Практичнее смотреть не на абстрактную сумму, а на то, какая модель даёт первый подтверждённый отклик: продажи, лицензии, прослушивания или заказы.</p>
    </div></section>
    <StarterPathVisual />
    <section className={section}><h2 className={heading}>12. Как начать зарабатывать на Суно</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <ol>
        <li>Проверьте тариф и коммерческие права именно на этот трек.</li>
        <li>Скачайте разрешённый файл через предусмотренный канал Суно.</li>
        <li>Проверьте собственные тексты, сэмплы и другие исходники.</li>
        <li>Выберите одну модель: стриминги, продажа, заказ, лицензия, контент, бизнес или АудиоЛад.</li>
        <li>Упакуйте музыку: название, обложка, описание, аудитория.</li>
        <li>Опубликуйте на подходящей площадке и приведите первых слушателей или покупателей.</li>
        <li>По отклику решите, масштабировать эту модель или добавить соседнюю.</li>
      </ol>
    </div></section>
    <section className={section}><h2 className={heading}>13. А можно ли вообще зарабатывать на Суно</h2><div className={`mt-5 ${articleBodyStackClass}`}>
      <p>Да, если вы относитесь к Суно как к инструменту производства, а не как к кнопке автоматического дохода. Коммерческие права, понятный продукт и канал до аудитории важнее количества случайных генераций.</p>
      <p>Если музыки ещё нет – <Link href="/kak-sozdat-muzyku-v-suno" className={linkClass}>как создать музыку в Суно</Link>. Если трек готов, но не выбран канал публикации – <Link href="/kuda-vykladyvat-muzyku-iz-suno" className={linkClass}>куда выкладывать музыку из Суно</Link>. Если нужна широкая карта моделей – <Link href="/mozhno-li-zarabotat-na-ii-muzyke" className={linkClass}>можно ли заработать на ИИ-музыке</Link>.</p>
    </div></section>
    <AiMusicIntroCta paragraphs={["Если музыка уже создана, её можно оформить в АудиоЛаде как полноценный музыкальный продукт: добавить название, обложку, описание и постепенно собирать каталог под понятную нишу.", "Можно зарегистрироваться бесплатно и начать с первого музыкального продукта, когда будете готовы. Доход не гарантирован автоматически – он зависит от прав, упаковки и спроса."]} />
    <section className={section} id="faq"><h2 className={heading}>Частые вопросы</h2><ArticleFaqList items={KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ} /></section>
  </article>;
}
