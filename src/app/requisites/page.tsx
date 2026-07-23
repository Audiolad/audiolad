import type { Metadata } from "next";

import LegalPageShell from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Реквизиты – АудиоЛад",
  description: "Официальные реквизиты платформы АудиоЛад.",
};

type RequisiteItemProps = {
  label: string;
  children: React.ReactNode;
};

function RequisiteItem({ label, children }: RequisiteItemProps) {
  return (
    <div className="mt-5">
      <p className="text-sm font-medium text-[#7d70a2]">{label}</p>
      <div className="mt-1.5 break-words text-[15px] leading-6 text-[#25135c]">
        {children}
      </div>
    </div>
  );
}

const linkClassName =
  "text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

export default function RequisitesPage() {
  return (
    <LegalPageShell>
          <h1 className="mt-6 text-[28px] font-semibold leading-tight">
            Реквизиты
          </h1>

          <p className="mt-4 text-[15px] leading-6 text-[#6f61a3]">
            На этой странице размещены официальные реквизиты владельца
            платформы «АудиоЛад».
          </p>

          <p className="mt-4 text-[15px] leading-6 text-[#6f61a3]">
            Продавцом доступа к аудиоматериалам является Индивидуальный
            предприниматель Петров Сергей Сергеевич.
          </p>

          <section className="mt-6" aria-label="Официальные реквизиты">
            <RequisiteItem label="Наименование">
              Индивидуальный предприниматель Петров Сергей Сергеевич
            </RequisiteItem>

            <RequisiteItem label="ОГРНИП">316505300063237</RequisiteItem>

            <RequisiteItem label="ИНН">507305817690</RequisiteItem>

            <RequisiteItem label="Дата государственной регистрации">
              25 ноября 2016 года
            </RequisiteItem>

            <RequisiteItem label="Адрес регистрации ИП">
              355045, г. Ставрополь, ул. 45 Параллель, д. 73, кв. 45
            </RequisiteItem>

            <RequisiteItem label="Расчётный счёт">
              40802810720000122219
            </RequisiteItem>

            <RequisiteItem label="Банк">ООО «Банк Точка»</RequisiteItem>

            <RequisiteItem label="БИК">044525104</RequisiteItem>

            <RequisiteItem label="Корреспондентский счёт">
              30101810745374525104
            </RequisiteItem>

            <RequisiteItem label="Электронная почта">
              <a href="mailto:1@audiolad.ru" className={linkClassName}>
                1@audiolad.ru
              </a>
            </RequisiteItem>

            <RequisiteItem label="Телефон">
              <a href="tel:+79264111381" className={linkClassName}>
                +7 926 411-13-81
              </a>
            </RequisiteItem>

            <RequisiteItem label="Сайт">
              <a
                href="https://audiolad.ru"
                className={linkClassName}
                rel="noopener noreferrer"
              >
                audiolad.ru
              </a>
            </RequisiteItem>
          </section>

          <section className="mt-10" aria-labelledby="about-platform-title">
            <h2
              id="about-platform-title"
              className="text-[22px] font-semibold leading-tight text-[#25135c]"
            >
              О сайте «АудиоЛад»
            </h2>

            <p className="mt-4 text-[15px] leading-6 text-[#6f61a3]">
              АудиоЛад – платформа авторских аудиопрактик, медитаций и программ.
            </p>
          </section>
    </LegalPageShell>
  );
}
