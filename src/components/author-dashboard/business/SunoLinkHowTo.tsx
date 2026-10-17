import Image from "next/image";

export const SUNO_LINK_HOWTO_STEPS = [
  "нажмите три точки справа от трека;",
  "выберите Share;",
  "нажмите Copy Link и вставьте ссылку сюда.",
] as const;

export default function SunoLinkHowTo() {
  return (
    <div className="mt-2 text-xs text-neutral-600" data-testid="suno-link-howto">
      <p className="font-medium text-neutral-700">Как взять ссылку на трек в Suno:</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        {SUNO_LINK_HOWTO_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <details className="mt-2">
        <summary className="cursor-pointer select-none text-neutral-800 underline underline-offset-2">Показать, где это</summary>
        <div className="mt-2 space-y-3">
          <figure>
            <Image
              src="/images/help/suno-share-menu.webp"
              alt="Список треков в Suno: справа от трека открыто меню «три точки», в нём выделен пункт Share"
              width={1200}
              height={466}
              className="h-auto w-full rounded-lg border border-neutral-200"
            />
            <figcaption className="mt-1">Шаги 1–2: три точки справа от трека → Share</figcaption>
          </figure>
          <figure>
            <Image
              src="/images/help/suno-copy-link.webp"
              alt="Окно Suno «Share to…»: первая кнопка слева – Copy Link"
              width={1166}
              height={474}
              className="h-auto w-full rounded-lg border border-neutral-200"
            />
            <figcaption className="mt-1">Шаг 3: Copy Link – ссылка скопирована, вставьте её в поле выше</figcaption>
          </figure>
        </div>
      </details>
    </div>
  );
}
