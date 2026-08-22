import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";

import MaxBridgeScript from "./MaxBridgeScript";

const logoLinkClassName =
  "inline-flex max-w-full justify-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const logoImageClassName =
  "h-16 w-auto max-w-full object-contain object-center";

export default function MaxMiniAppScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#faf8ff] px-6 py-12 text-center">
      <MaxBridgeScript />
      <AudioladHorizontalLogo
        className={logoImageClassName}
        linkClassName={logoLinkClassName}
        priority
        sizes="256px"
      />
      <h1 className="mt-8 text-[32px] font-semibold leading-tight text-[#25135c]">
        АудиоЛад
      </h1>
      <p className="mt-3 max-w-sm text-[17px] leading-6 text-[#4a3d73]">
        Музыка, медитации, аудиопрактики и аудиокурсы
      </p>
      <p className="mt-8 text-sm font-medium text-[#7042c5]">
        АудиоЛад открыт внутри MAX
      </p>
    </main>
  );
}
