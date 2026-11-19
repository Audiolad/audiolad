/**
 * t1544u / t1567u: скрытый правовой раздел /b/coffee/legal.
 * - каждая страница noindex/nofollow, X-Robots-Tag в next.config;
 * - нет в sitemap и нет ссылок на /b/coffee/legal из остального кода;
 * - только «–», внешних ссылок нет, кроме МАКС-контакта Сергея;
 * - проверка сертификата: образец находится, неизвестный номер – не найден.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  BUSINESS_LEGAL_CERTIFICATE_HREF,
  BUSINESS_LEGAL_CONTACT,
  BUSINESS_LEGAL_HREF,
  BUSINESS_LEGAL_OFFER_HREF,
  BUSINESS_LEGAL_PROTECTION_HREF,
  BUSINESS_LEGAL_RIGHTS_HREF,
  BUSINESS_LEGAL_ROBOTS,
  BUSINESS_LEGAL_SAMPLE_CERTIFICATE,
  findBusinessLegalCertificate,
  normalizeBusinessLegalCertificateNumber,
} from "../src/lib/business/legal/section";

const ROOT = process.cwd();
const SECTION_DIR = join(ROOT, "src/app/(platform)/b/coffee/legal");
const COMPONENT_DIR = join(ROOT, "src/components/business/legal");
const OWN_FILES = new Set([
  join(ROOT, "src/lib/business/legal/section.ts"),
]);
// t1591u: кабинет владельца ссылается на раздел (договор, сертификат заведения, QR). Меню, подвал и sitemap – нет.
const CABINET_LINKERS = new Set([
  join(ROOT, "src/lib/business-app/business-offer-content.ts"), // текст оферты: адрес страницы проверки
  join(ROOT, "src/lib/business/legal/certificate.ts"),
  join(ROOT, "src/lib/business/legal/certificate.server.ts"),
  join(ROOT, "src/lib/business/legal/certificate-context.server.ts"),
  join(ROOT, "src/app/business-app/documents/page.tsx"),
  join(ROOT, "src/app/business-app/documents/business-offer/page.tsx"),
  join(ROOT, "src/app/business-app/documents/sertifikat/page.tsx"),
  join(ROOT, "src/components/business-app/legal/BusinessCertificateSetup.tsx"),
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sectionFiles = walk(SECTION_DIR);
const componentFiles = walk(COMPONENT_DIR);
const pages = sectionFiles.filter((f) => f.endsWith("page.tsx"));
assert.equal(pages.length, 6, "6 страниц раздела (t1591u: + договор-оферта)");
assert.ok(sectionFiles.some((f) => f.endsWith(`${join("legal", "layout.tsx")}`)), "layout раздела");
assert.ok(componentFiles.some((f) => f.endsWith("business-legal.css")), "coffee CSS");
for (const f of [...sectionFiles, ...componentFiles]) OWN_FILES.add(f);

// robots
assert.deepEqual(BUSINESS_LEGAL_ROBOTS && typeof BUSINESS_LEGAL_ROBOTS === "object" && {
  index: (BUSINESS_LEGAL_ROBOTS as { index?: boolean }).index,
  follow: (BUSINESS_LEGAL_ROBOTS as { follow?: boolean }).follow,
}, { index: false, follow: false });
for (const f of pages) {
  assert.match(readFileSync(f, "utf8"), /robots: BUSINESS_LEGAL_ROBOTS/, `${f}: robots noindex`);
}
const nextConfig = readFileSync(join(ROOT, "next.config.ts"), "utf8");
for (const src of ["/b/legal", "/b/legal/:path*", "/b/coffee/legal", "/b/coffee/legal/:path*", "/b-legal/:path*"]) {
  assert.ok(
    new RegExp(`source: "${src.replace(/[*/]/g, "\\$&")}",\\s*headers: \\[\\{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" \\}\\]`).test(nextConfig),
    `X-Robots-Tag для ${src}`,
  );
}

// sitemap
const sitemapData = readFileSync(join(ROOT, "src/lib/seo/sitemap-data.ts"), "utf8");
assert.doesNotMatch(sitemapData, /\/b\/(?:coffee\/)?legal/, "раздела нет в sitemap");

assert.match(nextConfig, /source: "\/b\/legal", destination: "\/b\/coffee\/legal", statusCode: 301/);
assert.match(nextConfig, /source: "\/b\/legal\/:path\*", destination: "\/b\/coffee\/legal\/:path\*", statusCode: 301/);

assert.equal(BUSINESS_LEGAL_HREF, "/b/coffee/legal");
assert.equal(BUSINESS_LEGAL_RIGHTS_HREF, "/b/coffee/legal/prava");
assert.equal(BUSINESS_LEGAL_PROTECTION_HREF, "/b/coffee/legal/zashchita");
assert.equal(BUSINESS_LEGAL_CERTIFICATE_HREF, "/b/coffee/legal/sertifikat");
assert.equal(BUSINESS_LEGAL_OFFER_HREF, "/b/coffee/legal/oferta");

// ссылки на раздел только изнутри раздела
const offenders = walk(join(ROOT, "src"))
  .filter((f) => /\.(tsx?|mts|md|mdx|json)$/.test(f) && !OWN_FILES.has(f) && !CABINET_LINKERS.has(f))
  .filter((f) => /["'`(]\/b\/(?:coffee\/)?legal|audiolad\.ru\/b\/(?:coffee\/)?legal|business\/legal\/section|business\/legal\/BusinessLegalShell/.test(readFileSync(f, "utf8")));
assert.deepEqual(offenders, [], "на /b/coffee/legal ссылается только кабинет владельца");
for (const f of ["src/components/business-app/BusinessSidebar.tsx", "src/components/business-app/BusinessBottomNav.tsx", "src/lib/business-app/nav.ts"]) {
  assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /coffee\/legal|business\/legal\/section/, `${f}: раздела нет в меню`);
}

// тексты
for (const f of [...sectionFiles, ...OWN_FILES]) {
  const text = readFileSync(f, "utf8");
  assert.doesNotMatch(text, /—/, `${f}: длинное тире`);
  const external = [...text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]).filter((u) => !/^https:\/\/audiolad\.ru(\/|$)/.test(u));
  assert.deepEqual(external, [], `${f}: внешние ссылки в тексте`);
  assert.doesNotMatch(text, /Suno|уточнить|\[ЮРИСТ|\[СЕРГЕЙ/i, `${f}: черновые пометки`);
}

// стиль кофейни: в разделе не осталось фиолетовой палитры /b/prava
const PURPLE = /#7042c5|#fbf9ff|#f4e9ff|#eadff8|#faf6ff|#eee3f8|#6d5a9e|#4c3d78|#25135c/i;
for (const f of [...sectionFiles, ...componentFiles]) {
  if (f.endsWith(".png") || f.endsWith(".pdf")) continue;
  assert.doesNotMatch(readFileSync(f, "utf8"), PURPLE, `${f}: фиолетовая палитра`);
}
const shell = readFileSync(join(COMPONENT_DIR, "BusinessLegalShell.tsx"), "utf8");
const css = readFileSync(join(COMPONENT_DIR, "business-legal.css"), "utf8");
assert.match(css, /--legal-bg: #f7f1e8/, "кремовый фон кофейни");
assert.match(css, /--legal-accent: #6f4326/, "коричневый акцент кофейни");
assert.match(css, /--legal-text: #2b1d14/, "espresso текст");
assert.doesNotMatch(css, /business-app\/theme\/business-theme\.css/, "тема кабинета не импортируется в CSS раздела");
assert.doesNotMatch(
  readFileSync(join(SECTION_DIR, "layout.tsx"), "utf8"),
  /business-app\/theme\/business-theme\.css/,
  "тема кабинета не импортируется в layout раздела",
);
assert.doesNotMatch(
  readFileSync(join(SECTION_DIR, "layout.tsx"), "utf8"),
  /next\/font\/google/,
  "второй Playfair в layout раздела не нужен: шрифт уже задаёт /b/coffee",
);
for (const f of [...sectionFiles, ...componentFiles, join(ROOT, "src/lib/business/legal/section.ts")]) {
  if (f.endsWith(".png") || f.endsWith(".pdf") || f.endsWith(".css")) continue;
  assert.doesNotMatch(readFileSync(f, "utf8"), /АудиоЛад Бизнес/, `${f}: видимое имя продукта – АудиоЛад Кофейня`);
}

assert.match(shell, /COFFEE_BRAND_NAME/, "шапка АудиоЛад Кофейня");
assert.doesNotMatch(shell, /data-biz-theme/, "без data-biz-theme на audiolad.ru");
assert.ok(BUSINESS_LEGAL_CONTACT.maxHref.startsWith("https://max.ru/u/"), "МАКС – прямая ссылка Сергея");
assert.equal(BUSINESS_LEGAL_CONTACT.phoneHref, "tel:+79264111381");
assert.equal(BUSINESS_LEGAL_CONTACT.email, "1@audiolad.ru");

// номера сертификатов
assert.equal(normalizeBusinessLegalCertificateNumber("alk-2026-000001"), "ALK-2026-000001");
assert.equal(normalizeBusinessLegalCertificateNumber(encodeURIComponent("АЛК-2026-000001")), "ALK-2026-000001");
assert.equal(normalizeBusinessLegalCertificateNumber("ALK-2026-1"), null);
assert.equal(normalizeBusinessLegalCertificateNumber("%E0%A4%A"), null);
assert.equal(findBusinessLegalCertificate("ALK-2026-000001"), BUSINESS_LEGAL_SAMPLE_CERTIFICATE);
assert.equal(findBusinessLegalCertificate("ALK-2026-000002"), null);
assert.equal(findBusinessLegalCertificate("../../etc"), null);

// ссылки в тексте документов открываются в новой вкладке; tel:/mailto: – нет
const indexPage = readFileSync(join(SECTION_DIR, "page.tsx"), "utf8");
const rightsPage = readFileSync(join(SECTION_DIR, "prava/page.tsx"), "utf8");
const protectionPage = readFileSync(join(SECTION_DIR, "zashchita/page.tsx"), "utf8");
assert.match(indexPage, /в пяти шагах/, "модель в пяти шагах");
assert.match(indexPage, /Пункт 4 статьи 1244 ГК РФ/, "шаг 3 – п. 4 ст. 1244 из модели");
assert.match(indexPage, /18\.11\.2026 ИП Петров Сергей Сергеевич направил в РАО и ВОИС уведомления/, "уведомления 18.11.2026 на главной");
assert.match(rightsPage, /18\.11\.2026 ИП Петров Сергей Сергеевич направил в РАО и ВОИС уведомления/, "уведомления 18.11.2026 в правах");
assert.match(rightsPage, /Закон различает два вида прав на музыку:/, "права: два вида");
assert.match(rightsPage, /<ol className=\{\`\$\{legalListClass\} business-legal__list--numbered\`\}>/, "права: нумерованный список");
assert.match(rightsPage, /Само произведение – мелодия, гармония, аранжировка и стихи песни, если они есть/, "права: произведение");
assert.match(rightsPage, /Фонограмма – запись звучания/, "права: фонограмма");
assert.match(rightsPage, /На этом различии и построена наша модель/, "права: модель");
assert.doesNotMatch(rightsPage, /Закон различает музыкальное произведение и фонограмму – запись звуков/, "старый лид прав убран");
assert.match(protectionPage, /title: "Финансовое возмещение\."/, "шаг переименован в финансовое возмещение");
assert.match(protectionPage, /выплаты по мировому соглашению, которое мы заранее письменно одобрили/, "в возмещение входит одобренное мировое");
assert.match(protectionPage, /По нашему решению можем перечислить деньги заведению заранее или оплатить сумму напрямую получателю, когда это юридически допустимо; лимит от этого не меняется/, "аванс или прямая оплата получателю, лимит тот же");
assert.match(protectionPage, /судебные расходы другой стороны, взысканные с заведения/, "в возмещение входят судебные расходы другой стороны");
assert.match(protectionPage, /Финансовое возмещение – в пределах 300 000 рублей на одно заведение за 12 месяцев/, "лимит только на финансовое возмещение");
assert.match(protectionPage, /Этот лимит\s+относится только к суммам, которые мы возмещаем заведению/, "лимит только на суммы возмещения");
assert.match(protectionPage, /Юридическую защиту и юридическое\s+сопровождение организуем мы сами/, "защиту и сопровождение организуем мы");
assert.match(protectionPage, /доказательства по журналу воспроизведения и отчёту «Что играло в заведении»/, "доказательства по журналу и отчёту");
assert.match(protectionPage, /Эти расходы мы оплачиваем дополнительно,\s+сверх этого лимита/, "расходы на защиту оплачиваем сверх лимита");
assert.match(protectionPage, /Эти расходы мы оплачиваем дополнительно, сверх лимита финансового возмещения/, "в шаге суда расходы тоже сверх лимита");
assert.doesNotMatch(protectionPage, /не входят/, "на странице защиты убрана формулировка «не входят»");
assert.match(protectionPage, /по утверждённым нами сметам/, "защита по утверждённым сметам");
assert.match(protectionPage, /Если заведение нанимает юриста само, оплату нужно заранее письменно согласовать с нами/, "свой юрист только с письменного согласования");
assert.doesNotMatch(protectionPage, /Юридическая защита и возмещение – в пределах совокупного лимита/, "старый совокупный лимит убран");
assert.doesNotMatch(protectionPage, /Возмещение по решению суда/, "старый заголовок шага убран");
assert.match(indexPage, /в пределах 300 000 рублей на одно заведение за 12 месяцев\. Расходы на юридическую защиту\s+и юридическое сопровождение мы оплачиваем дополнительно, сверх этого лимита/, "на главной расходы на защиту сверх лимита");
assert.match(indexPage, /Расходы на\s+юридическую защиту в суде и юридическое сопровождение по таким требованиям мы оплачиваем дополнительно,\s+сверх этого лимита/, "в вопросе о стоимости защиты расходы на защиту сверх лимита");
assert.doesNotMatch(indexPage, /не входят/, "на главной убрана формулировка «не входят»");
assert.doesNotMatch(indexPage, /в четырёх шагах/, "старый заголовок четырёх шагов убран");
// t1591u: пробная (подарочная) неделя – действующий доступ; начатая защита доводится до конца.
assert.match(protectionPage, /этот доступ действует – оплаченный или подарочный период/, "подарочный период считается");
assert.match(protectionPage, /Если защита уже\s+началась, доводим спор до конца/, "начатую защиту доводим");
assert.match(protectionPage, /Ведём дело во всех инстанциях, в том числе административные дела по ч\. 1 ст\. 7\.12 КоАП РФ/);
assert.doesNotMatch(protectionPage, /доступ к этому заведению оплачен/, "нет условия «только оплаченный доступ»");
const offerPage = readFileSync(join(SECTION_DIR, "oferta/page.tsx"), "utf8");
assert.match(offerPage, /BUSINESS_OFFER_SOURCE\.markdown/, "оферта – тот же принятый текст");
assert.match(offerPage, /BUSINESS_LEGAL_OFFER_PDF_PATH/);
assert.match(indexPage, /href: BUSINESS_LEGAL_OFFER_HREF/, "главная раздела ведёт на оферту");
const certPage = readFileSync(join(SECTION_DIR, "sertifikat/page.tsx"), "utf8");
assert.doesNotMatch(certPage, /юридическ\S* адрес/, "юр. адрес не обещаем: реестр его не отдаёт");
const checkPage = readFileSync(join(SECTION_DIR, "sertifikat/[number]/page.tsx"), "utf8");
assert.match(checkPage, /loadCertificateCheck/, "проверка настоящих сертификатов из базы");
assert.match(checkPage, /force-dynamic/);

const headerNav = /className="business-legal__brand"|business-legal__crumbs/;
for (const f of [...sectionFiles, ...componentFiles]) {
  if (!/\.(tsx)$/.test(f)) continue;
  const text = readFileSync(f, "utf8");
  const tags = [...text.matchAll(/<(?:Link|a)\b[\s\S]*?>/g)].map((m) => m[0]);
  for (const tag of tags) {
    const href = /href=\{?["']?([^"'\s}]+)/.exec(tag)?.[1] ?? "";
    const isTelMail = /^(tel:|mailto:)/.test(href) || tag.includes("emailHref") || tag.includes("phoneHref");
    const isHeader = /business-legal__brand/.test(tag) || (f.endsWith("BusinessLegalShell.tsx") && tag.includes("BUSINESS_LEGAL_HREF") && !tag.includes("legalDocLinkProps") && !tag.includes("legalLinkClass"));
    if (isTelMail) {
      assert.doesNotMatch(tag, /target=|_blank/, `${f}: tel/mailto без новой вкладки: ${tag}`);
      continue;
    }
    if (isHeader) continue;
    assert.match(tag, /target="_blank"|legalDocLinkProps/, `${f}: документная ссылка без новой вкладки: ${tag}`);
  }
}
assert.match(shell, /rel="nofollow noopener" target="_blank"/, "МАКС – новая вкладка");

// t1604u: красные пункты сертификата ведут прямо туда, где их исправляют; в кабинете – «заведение», не «кофейня».
{
  const setup = readFileSync(join(ROOT, "src/components/business-app/legal/BusinessCertificateSetup.tsx"), "utf8");
  assert.match(setup, /inn: `\/documents#\$\{BUSINESS_CERTIFICATE_INN_ANCHOR_ID\}`/, "ИНН → блок ИНН");
  assert.match(setup, /address: "\/preferences#venue"/, "адрес → форма заведения");
  assert.match(setup, /offer: `\/documents#\$\{BUSINESS_OFFER_REACCEPT_ANCHOR_ID\}`/, "редакция → карточка принятия");
  assert.match(setup, /id=\{BUSINESS_CERTIFICATE_INN_ANCHOR_ID\}/, "якорь блока ИНН");
  const reaccept = readFileSync(join(ROOT, "src/components/business-app/legal/BusinessOfferReacceptPrompt.tsx"), "utf8");
  assert.match(reaccept, /id="offer-reaccept"/, "якорь карточки принятия");
  const certPage = readFileSync(join(ROOT, "src/app/business-app/documents/sertifikat/page.tsx"), "utf8");
  assert.match(certPage, /<BusinessCertificateMissingItem\s/, "страница сертификата – те же пункты-ссылки");
  assert.match(setup, /const allowed = missing === "offer" \? canAcceptOffer : canEditIdentity;/, "ссылка только когда цель есть на странице");
  for (const src of [setup, certPage]) {
    assert.match(src, /canEditIdentity=\{context\.canEditIdentity\}/, "ИНН/адрес – ссылка только у владельца");
    assert.match(src, /canAcceptOffer=\{Boolean\(context\.offerPrompt\)\}/, "редакция – ссылка только при карточке принятия");
  }
  for (const f of [
    "src/app/business-app/documents/page.tsx",
    "src/app/business-app/documents/sertifikat/page.tsx",
    "src/lib/business-app/licensing-copy.ts",
    "src/lib/business-app/greeting.ts",
    "src/lib/business-app/home-checklist.ts",
    "src/app/business-app/settings/page.tsx",
    "src/components/business-app/profile/BusinessTimezoneForm.tsx",
  ]) {
    const text = readFileSync(join(ROOT, f), "utf8").replace(/«АудиоЛад Кофейня»|АудиоЛад Кофейня/g, "");
    assert.doesNotMatch(text, /[Кк]офейн/, `${f}: в кабинете – «заведение»`);
  }
}

console.log("business-legal-section-unit: PASS");
