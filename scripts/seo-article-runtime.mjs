import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_BIN = resolve(ROOT, "node_modules/next/dist/bin/next");
const BUILD_ID_PATH = resolve(ROOT, ".next/BUILD_ID");
const CTA_HEADING = "Хотите создать свою медитацию? Выберите, с чего начать.";
const STUDIO_HREF = "https://audiolad.ru/studio/meditation";
const SCHOOL_ORIGIN = "https://school.audiolad.ru";
const CREATOR_ARTICLES = [
  {
    path: "/articles/kak-sozdat-svoyu-meditatsiyu",
    h1: "Как создать свою медитацию: от идеи до готовой аудиозаписи",
    metaTitle: "Как сделать медитацию самому: пошаговое руководство",
    metaDescription:
      "Как сделать медитацию самому: запишите голос, добавьте музыку и соберите готовую аудиопрактику в браузере. Пошаговое руководство для начинающих.",
    canonicalUrl: "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    productLinkCount: 9,
  },
  {
    path: "/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    h1: "Как записать медитацию самостоятельно: пошаговая инструкция",
    metaTitle: "Как записать медитацию самостоятельно: пошаговая инструкция",
    metaDescription:
      "Как записать медитацию самостоятельно дома: подготовить помещение, телефон или микрофон, голос, сделать тестовую запись и обработать результат.",
    canonicalUrl:
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    productLinkCount: 8,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
  },
  {
    path: "/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
    h1: "Как записать медитацию с музыкой самостоятельно: пошаговое руководство",
    metaTitle: "Как записать медитацию с музыкой самостоятельно",
    metaDescription:
      "Как записать медитацию с музыкой самостоятельно: выбрать подходящий фон, соединить голос и музыку, настроить громкость и плавные переходы.",
    canonicalUrl:
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    ],
  },
  {
    path: "/articles/kak-napisat-tekst-meditatsii",
    h1: "Как написать текст медитации: структура, сценарий и примеры",
    metaTitle: "Как написать текст медитации: структура и примеры",
    metaDescription:
      "Как написать текст медитации: определить задачу, выстроить структуру и сценарий, подобрать фразы, расставить паузы и проверить текст голосом.",
    canonicalUrl: "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
    productLinkCount: 8,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ],
  },
  {
    path: "/articles/prilozhenie-dlya-zapisi-meditatsiy",
    h1: "Приложение для записи медитаций: как записать практику онлайн",
    metaTitle: "Приложение для записи медитаций онлайн",
    metaDescription:
      "Приложение для записи медитаций: запишите или загрузите голос, добавьте музыку, настройте дорожки и создайте готовую аудиопрактику онлайн.",
    canonicalUrl:
      "https://audiolad.ru/articles/prilozhenie-dlya-zapisi-meditatsiy",
    productLinkCount: 11,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
    ],
  },
  {
    path: "/articles/obuchenie-sozdaniyu-meditatsiy",
    h1: "Обучение созданию медитаций: как научиться создавать свои аудиопрактики",
    metaTitle: "Обучение созданию медитаций и аудиопрактик",
    metaDescription:
      "Обучение созданию медитаций: сценарий, текст, голос, запись и музыка. Как освоить создание собственных аудиопрактик с нуля и пройти весь путь системно.",
    canonicalUrl: "https://audiolad.ru/articles/obuchenie-sozdaniyu-meditatsiy",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
    ],
  },
  {
    path: "/articles/sozdanie-muzyki-dlya-meditatsiy",
    h1: "Создание музыки для медитаций: как сделать музыкальное сопровождение для практики",
    metaTitle: "Создание музыки для медитаций: как сделать сопровождение",
    metaDescription:
      "Как создать музыку для медитации самостоятельно: выбрать характер звучания, собрать музыкальную основу, подготовить её под голос и проверить права.",
    canonicalUrl: "https://audiolad.ru/articles/sozdanie-muzyki-dlya-meditatsiy",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
  },
  {
    path: "/articles/kak-psikhologu-nayti-klientov",
    h1: "Как психологу найти клиентов: способы привлечения клиентов в частную практику",
    metaTitle: "Как психологу найти клиентов в частную практику",
    metaDescription:
      "Как психологу найти клиентов: рекомендации, блог, поисковый трафик, соцсети, партнёрства и другие способы выстроить систему привлечения в частную практику.",
    canonicalUrl: "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ],
  },
  {
    path: "/articles/prodvizhenie-psikhologa",
    h1: "Продвижение психолога: как продвигать себя и свои услуги",
    metaTitle: "Продвижение психолога: как продвигать себя и услуги",
    metaDescription:
      "Продвижение психолога: как выстроить позиционирование, контент, сайт, поиск, рекомендации, рекламу и систему продвижения своих услуг.",
    canonicalUrl: "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ],
  },
  {
    path: "/articles/reklama-psikhologa",
    h1: "Реклама психолога: где и как рекламировать свои услуги",
    metaTitle: "Реклама психолога: где и как рекламировать услуги",
    metaDescription:
      "Реклама психолога: где рекламировать услуги, куда вести аудиторию, как написать объявление, избежать ошибок и оценивать реальные обращения.",
    canonicalUrl: "https://audiolad.ru/articles/reklama-psikhologa",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ],
  },
  {
    path: "/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
    h1: "Как начинающему психологу найти первых клиентов",
    metaTitle: "Как начинающему психологу найти первых клиентов",
    metaDescription:
      "Как начинающему психологу найти первых клиентов: где искать первые обращения, как сформировать доверие, начать без большой аудитории и выстроить простую систему.",
    canonicalUrl:
      "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    requiredSnippets: [
      "https://audiolad.ru/articles/reklama-psikhologa",
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ],
  },
  {
    path: "/articles/chastnaya-praktika-psikhologa",
    h1: "Частная практика психолога: как начать и развивать своё дело",
    metaTitle: "Частная практика психолога: как начать и развивать",
    metaDescription:
      "Частная практика психолога: как начать работать на себя, организовать консультации, привлечение клиентов, доход и развитие собственной практики.",
    canonicalUrl: "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
      "https://audiolad.ru/articles/reklama-psikhologa",
    ],
  },
  {
    path: "/articles/blog-psikhologa",
    h1: "Блог психолога: как вести блог, который помогает находить клиентов",
    metaTitle: "Блог психолога: как вести блог и находить клиентов",
    metaDescription:
      "Блог психолога: как выбрать темы, вести блог регулярно, формировать доверие, находить клиентов и превращать накопленный контент в полезные материалы.",
    canonicalUrl: "https://audiolad.ru/articles/blog-psikhologa",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
      "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
    ],
  },
  {
    path: "/articles/prodazhi-psikhologa",
    h1: "Продажи психолога: как продавать консультации и свои услуги",
    metaTitle: "Продажи психолога: как продавать консультации и услуги",
    metaDescription:
      "Продажи психолога: как продавать консультации и услуги без давления, выстроить понятное предложение, воронку и путь от интереса к записи.",
    canonicalUrl: "https://audiolad.ru/articles/prodazhi-psikhologa",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    requiredSnippets: [
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
      "https://audiolad.ru/articles/blog-psikhologa",
      "https://audiolad.ru/articles/reklama-psikhologa",
      "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
    ],
  },
  {
    path: "/articles/kak-psikhologu-zarabotat",
    h1: "Как психологу заработать: способы увеличить доход и монетизировать опыт",
    metaTitle: "Как психологу заработать: способы увеличить доход",
    metaDescription:
      "Как психологу заработать: консультации, группы, цифровые материалы и аудиопродукты. Как увеличить доход и монетизировать профессиональный опыт.",
    canonicalUrl: "https://audiolad.ru/articles/kak-psikhologu-zarabotat",
    productLinkCount: 10,
    requiredSnippet:
      "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
      "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
      "https://audiolad.ru/articles/blog-psikhologa",
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
      "https://audiolad.ru/articles/prodazhi-psikhologa",
    ],
  },
  {
    path: "/articles/produkty-psikhologa",
    h1: "Продукты психолога: что можно создать кроме консультаций",
    metaTitle: "Продукты психолога: что создать кроме консультаций",
    metaDescription:
      "Продукты психолога: какие форматы можно создать кроме консультаций, как выбрать первый продукт, собрать онлайн-продукт и выстроить продуктовую линейку.",
    canonicalUrl: "https://audiolad.ru/articles/produkty-psikhologa",
    productLinkCount: 10,
    requiredSnippet: "https://audiolad.ru/articles/kak-psikhologu-zarabotat",
    requiredSnippets: [
      "https://audiolad.ru/articles/blog-psikhologa",
      "https://audiolad.ru/articles/prodazhi-psikhologa",
      "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    ],
  },
  {
    path: "/articles/kontent-dlya-psikhologa",
    h1: "Контент для психолога: темы и контент-план для блога",
    metaTitle: "Контент для психолога: темы и контент-план",
    metaDescription:
      "Контент для психолога: где брать темы, какие рубрики использовать, как составить контент-план для блога и превращать сильные темы в разные форматы.",
    canonicalUrl: "https://audiolad.ru/articles/kontent-dlya-psikhologa",
    productLinkCount: 10,
    requiredSnippet: "https://audiolad.ru/articles/blog-psikhologa",
    requiredSnippets: [
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
      "https://audiolad.ru/articles/produkty-psikhologa",
    ],
  },
  {
    path: "/articles/lichnyy-brend-psikhologa",
    h1: "Личный бренд психолога: как позиционировать себя и отличаться от конкурентов",
    metaTitle: "Личный бренд психолога: как позиционировать себя",
    metaDescription:
      "Личный бренд психолога: как выстроить позиционирование, выбрать специализацию, рассказать о себе и сформировать узнаваемый профессиональный образ.",
    canonicalUrl: "https://audiolad.ru/articles/lichnyy-brend-psikhologa",
    productLinkCount: 10,
    requiredSnippet: "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    requiredSnippets: [
      "https://audiolad.ru/articles/blog-psikhologa",
      "https://audiolad.ru/articles/kontent-dlya-psikhologa",
      "https://audiolad.ru/articles/produkty-psikhologa",
      "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
    ],
  },
  {
    path: "/articles/lid-magnit-dlya-psikhologa",
    h1: "Лид-магнит для психолога: что создать для привлечения новых клиентов",
    metaTitle: "Лид-магнит для психолога: идеи для привлечения клиентов",
    metaDescription:
      "Лид-магнит для психолога: идеи бесплатных материалов, выбор темы и формата, аудиопрактика и понятный следующий шаг после первого знакомства.",
    canonicalUrl: "https://audiolad.ru/articles/lid-magnit-dlya-psikhologa",
    productLinkCount: 10,
    requiredSnippet: "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    requiredSnippets: [
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
      "https://audiolad.ru/articles/kontent-dlya-psikhologa",
      "https://audiolad.ru/articles/produkty-psikhologa",
      "https://audiolad.ru/articles/prodazhi-psikhologa",
    ],
  },
  {
    path: "/articles/meditatsii-dlya-klientov-psikhologa",
    h1: "Медитации и аудиопрактики для клиентов психолога: как создать свой аудиопродукт",
    metaTitle: "Медитации для клиентов психолога: как создать аудиопрактику",
    metaDescription:
      "Как психологу создать медитацию или аудиопрактику для клиентов: выбрать тему, написать сценарий, записать голос и превратить материал в аудиопродукт.",
    canonicalUrl: "https://audiolad.ru/articles/meditatsii-dlya-klientov-psikhologa",
    productLinkCount: 11,
    requiredSnippet: "https://audiolad.ru/articles/kontent-dlya-psikhologa",
    requiredSnippets: [
      "https://audiolad.ru/articles/produkty-psikhologa",
      "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
      "https://audiolad.ru/articles/lid-magnit-dlya-psikhologa",
      "https://audiolad.ru/articles/kak-psikhologu-zarabotat",
    ],
  },
  {
    path: "/articles/prodvizhenie-koucha",
    h1: "Продвижение коуча: как продвигать себя и находить клиентов",
    metaTitle: "Продвижение коуча: как продвигать себя и находить клиентов",
    metaDescription:
      "Продвижение коуча: как определить специализацию, выбрать каналы и контент, выстроить понятное предложение и системно находить клиентов.",
    canonicalUrl: "https://audiolad.ru/articles/prodvizhenie-koucha",
    productLinkCount: 10,
  },
  {
    path: "/articles/skolko-zarabatyvaet-kouch",
    h1: "Сколько зарабатывает коуч: от чего зависит доход и как зарабатывать больше",
    metaTitle: "Сколько зарабатывает коуч: от чего зависит доход",
    metaDescription:
      "Сколько зарабатывает коуч, от чего зависит доход частного специалиста и как увеличить заработок через загрузку, форматы работы и собственные продукты.",
    canonicalUrl: "https://audiolad.ru/articles/skolko-zarabatyvaet-kouch",
    productLinkCount: 10,
    requiredSnippet: "https://audiolad.ru/articles/prodvizhenie-koucha",
  },
  {
    path: "/articles/kak-prodavat-svoi-uslugi",
    h1: "Как продавать свои услуги: как находить клиентов и продавать без навязывания",
    metaTitle: "Как продавать свои услуги без навязывания",
    metaDescription:
      "Как продавать свои услуги без навязывания: сформулировать понятное предложение, объяснить цену и формат, вести клиента к покупке и не давить на решение.",
    canonicalUrl: "https://audiolad.ru/articles/kak-prodavat-svoi-uslugi",
    productLinkCount: 10,
    requiredSnippet: "https://audiolad.ru/articles/prodazhi-psikhologa",
    requiredSnippets: [
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
      "https://audiolad.ru/articles/prodvizhenie-koucha",
    ],
  },
  {
    path: "/articles/reklama-tarologa",
    h1: "Реклама таролога: где и как рекламировать свои услуги",
    metaTitle: "Реклама таролога: где и как рекламировать услуги",
    metaDescription:
      "Реклама таролога: где рекламировать услуги, что написать в объявлении, куда вести человека, как оценивать обращения и рекламироваться без манипуляций.",
    canonicalUrl: "https://audiolad.ru/articles/reklama-tarologa",
    productLinkCount: 10,
    requiredSnippet: "https://audiolad.ru/articles/kak-prodavat-svoi-uslugi",
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function reserveLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not reserve a loopback port")));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function decodeUnicodeEscapes(value) {
  return value.replace(/\\u([0-9a-f]{4})/gi, (_match, code) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
}

function anchorsForHref(html, href) {
  return [...html.matchAll(/<a\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((anchor) => anchor.includes(`href="${href}"`));
}

async function fetchWhenReady(url, processRef, logs) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (processRef.exitCode !== null) {
      throw new Error(`next start exited early:\n${logs()}`);
    }

    try {
      const response = await fetch(url, {
        headers: { accept: "text/html" },
        signal: AbortSignal.timeout(3_000),
      });

      return response;
    } catch {
      await sleep(500);
    }
  }

  throw new Error(`Timed out waiting for ${url}:\n${logs()}`);
}

async function stopServer(processRef) {
  if (processRef.exitCode !== null) {
    return;
  }

  processRef.kill("SIGTERM");

  await Promise.race([
    new Promise((resolveExit) => processRef.once("exit", resolveExit)),
    sleep(5_000),
  ]);

  if (processRef.exitCode === null) {
    processRef.kill("SIGKILL");
  }
}

async function main() {
  assert(
    existsSync(BUILD_ID_PATH),
    "Production build is required. Run `npm run build` first.",
  );

  const port = await reserveLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const nextProcess = spawn(
    process.execPath,
    [NEXT_BIN, "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
          "seo-article-runtime-test-key",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  nextProcess.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  nextProcess.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    for (const article of CREATOR_ARTICLES) {
      const response = await fetchWhenReady(
        `${baseUrl}${article.path}`,
        nextProcess,
        () => output,
      );
      const html = await response.text();
      const renderedHtml = decodeUnicodeEscapes(html);
      const pageHtml = decodeUnicodeEscapes(
        html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""),
      );

      assert(
        response.status === 200,
        `${article.path} returned HTTP ${response.status}:\n${html.slice(0, 1_000)}`,
      );
      assert(
        pageHtml.includes(article.h1),
        `${article.path} is missing the approved H1`,
      );
      assert(
        renderedHtml.includes(article.metaTitle),
        `${article.path} is missing the approved meta title`,
      );
      assert(
        renderedHtml.includes(article.metaDescription),
        `${article.path} is missing the approved meta description`,
      );
      assert(
        renderedHtml.includes(`href="${article.canonicalUrl}"`),
        `${article.path} has an incorrect canonical URL`,
      );
      const ctaCount = pageHtml.split(CTA_HEADING).length - 1;
      assert(
        ctaCount === 2,
        `${article.path} must render two CreatorPathsCta blocks (found ${ctaCount})`,
      );
      assert(
        renderedHtml.includes(STUDIO_HREF),
        `${article.path} is missing Studio URL`,
      );
      assert(
        renderedHtml.includes(SCHOOL_ORIGIN),
        `${article.path} is missing School URL`,
      );
      const requiredSnippets = [
        ...(article.requiredSnippet ? [article.requiredSnippet] : []),
        ...(article.requiredSnippets ?? []),
      ];
      for (const snippet of requiredSnippets) {
        assert(
          renderedHtml.includes(snippet),
          `${article.path} is missing required link ${snippet}`,
        );
      }
      const creatorProductAnchors = [
        ...anchorsForHref(pageHtml, STUDIO_HREF),
        ...anchorsForHref(pageHtml, SCHOOL_ORIGIN),
      ];
      assert(
        creatorProductAnchors.length === article.productLinkCount,
        `${article.path} must render all Studio and School links (found ${creatorProductAnchors.length})`,
      );
      assert(
        creatorProductAnchors.every(
          (anchor) =>
            anchor.includes('target="_blank"') &&
            anchor.includes('rel="noopener noreferrer"'),
        ),
        `${article.path} Studio and School links must preserve the article in a safe new tab`,
      );
      assert(
        [...pageHtml.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)]
          .map((match) => match[0])
          .every(
            (anchor) =>
              anchor.includes(`href="${STUDIO_HREF}"`) ||
              anchor.includes(`href="${SCHOOL_ORIGIN}"`),
          ),
        `${article.path} may open only Studio and School links in a new tab`,
      );
      assert(
        renderedHtml.lastIndexOf("Частые вопросы") >
          renderedHtml.lastIndexOf(CTA_HEADING),
        `${article.path} FAQ must follow the bottom CreatorPathsCta`,
      );
      assert(
        !renderedHtml.includes(
          "useArticlePlayback must be used within ArticlePlaybackProvider",
        ),
        `${article.path} must not require ArticlePlaybackProvider`,
      );
      assert(
        !pageHtml.includes("article-primary-practice-heading"),
        `${article.path} must not render a practice player`,
      );
    }

    console.log("seo-article-runtime: OK");
  } finally {
    await stopServer(nextProcess);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
