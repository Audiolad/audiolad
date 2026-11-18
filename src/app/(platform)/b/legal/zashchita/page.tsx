import type { Metadata } from "next";

import BusinessLegalShell, {
  LegalContacts,
  LegalSteps,
  legalBodyClass,
  legalCardClass,
  legalH2Class,
  legalListClass,
} from "@/components/business/legal/BusinessLegalShell";
import {
  BUSINESS_LEGAL_NOTIFY_DAYS,
  BUSINESS_LEGAL_OFFER_EDITION,
  BUSINESS_LEGAL_RESPONSE_DAYS,
  BUSINESS_LEGAL_ROBOTS,
} from "@/lib/business/legal/section";

export const metadata: Metadata = {
  title: "Ответственность и защита заведения – АудиоЛад Бизнес",
  description: "Как «АудиоЛад Бизнес» помогает заведению при обращениях по музыке каталога и что возмещает.",
  robots: BUSINESS_LEGAL_ROBOTS,
};

export default function BusinessLegalProtectionPage() {
  return (
    <BusinessLegalShell
      kicker="Правовая информация"
      breadcrumb="Ответственность и защита заведения"
      title="Ответственность и защита заведения"
      lead="Мы отвечаем за права на музыку, которую даём заведению. Заведение, которое добросовестно пользуется нашим каталогом, не защищает нашу правовую модель в одиночку."
    >
      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Что мы берём на себя</h2>
        <p className={"mt-4 " + legalBodyClass}>
          «АудиоЛад Бизнес» отвечает за предоставление заведениям прав на фонограммы своего каталога. Права
          изготовителя на эти записи принадлежат ИП Петрову Сергею Сергеевичу, и защиту правовой модели, по которой
          мы даём музыку, мы берём на себя.
        </p>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Три уровня защиты</h2>
        <LegalSteps
          items={[
            {
              title: "Юридическая поддержка.",
              text: "Если заведение получило обращение РАО, ВОИС или другого лица по музыке нашего каталога, мы организуем его рассмотрение, даём нужные документы и юридическое сопровождение по условиям договора.",
            },
            {
              title: "Защита в суде.",
              text: "Если спор дошёл до суда и связан с правовым статусом нашей музыки, мы поддерживаем заведение и оплачиваем согласованные расходы на защиту в порядке, предусмотренном договором.",
            },
            {
              title: "Возмещение по решению суда.",
              text: "Если вступившим в законную силу судебным актом с заведения взысканы суммы за использование только нашего каталога по действующему договору, мы возмещаем предусмотренные договором имущественные потери.",
            },
          ]}
        />
        <p className={"mt-5 " + legalBodyClass}>
          Порядок и пределы возмещения, какие расходы покрываются и как урегулируются требования – в договоре-оферте
          «АудиоЛад Бизнес» в редакции от {BUSINESS_LEGAL_OFFER_EDITION}.
        </p>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Что нужно от заведения</h2>
        <ul className={legalListClass}>
          <li>Сообщить нам об обращении или требовании в течение {BUSINESS_LEGAL_NOTIFY_DAYS} рабочих дней.</li>
          <li>Передать документы: само обращение, дату, адрес точки, перечень треков.</li>
          <li>Помочь установить, как звучала музыка: какое устройство, в какое время.</li>
        </ul>
        <p className={"mt-4 " + legalBodyClass}>
          Чтобы защита работала, музыка в точке должна звучать только через плеер «АудиоЛад Бизнес».
        </p>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>На что защита распространяется</h2>
        <p className={"mt-4 " + legalBodyClass}>
          На музыку специализированного каталога, которая звучала через плеер в подключённой точке по действующему
          договору. На требования из-за сторонней музыки или нарушения условий лицензии защита не распространяется.
        </p>
      </section>

      <section className={legalCardClass}>
        <h2 className={legalH2Class}>Как написать нам</h2>
        <p className={"mt-4 " + legalBodyClass}>
          Перешлите обращение и укажите точку, дату и время. Мы сверим перечень треков с отчётом «Что играло в
          заведении» и в течение {BUSINESS_LEGAL_RESPONSE_DAYS} рабочих дней ответим и дадим документы о правах.
        </p>
        <LegalContacts />
      </section>
    </BusinessLegalShell>
  );
}
