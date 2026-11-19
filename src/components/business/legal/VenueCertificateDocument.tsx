import PointQrCode from "@/components/business-app/PointQrCode";
import { BUSINESS_LEGAL_CONTACT, BUSINESS_LEGAL_RESPONSE_DAYS } from "@/lib/business/legal/section";
import {
  certificateCheckUrl,
  certificateDisplayNumber,
  certificateRows,
  type CertificateSnapshot,
} from "@/lib/business/legal/certificate";

/**
 * Сертификат заведения для экрана и печати (приложение 2, пп. 6–7). Один компонент для кабинета
 * и для образца. Подпись и печать не нужны: подлинность – по QR-коду на audiolad.ru.
 */
export default function VenueCertificateDocument({
  number,
  issuedAt,
  snapshot,
  sample = false,
}: {
  number: string;
  issuedAt: string;
  snapshot: CertificateSnapshot;
  sample?: boolean;
}) {
  const rows = certificateRows({ number, issuedAt, snapshot });
  const checkUrl = certificateCheckUrl(number);
  return (
    <article className="venue-cert" data-testid="venue-certificate" data-certificate-number={number}>
      <header className="venue-cert__head">
        <div className="venue-cert__brand">АудиоЛад Кофейня</div>
        {sample ? <div className="venue-cert__sample">ОБРАЗЕЦ – данные вымышлены</div> : null}
        <h1 className="venue-cert__title">Сертификат заведения</h1>
        <p className="venue-cert__subtitle">о праве публичного исполнения фонограмм каталога «АудиоЛад Кофейня»</p>
        <p className="venue-cert__number">№ {certificateDisplayNumber(number)}</p>
      </header>

      <table className="venue-cert__table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="venue-cert__text">
        <p>
          <strong>Право.</strong> Лицензиат вправе публично исполнять фонограммы каталога как фоновую музыку в этом заведении
          через плеер «АудиоЛад Кофейня» в период доступа. Лицензию предоставляет сам правообладатель – напрямую
          (приложение 1, п. 1).
        </p>
        <p>
          <strong>Права на фонограммы.</strong> Фонограммы каталога созданы с помощью MusicGPT и других сервисов генерации
          музыки. Изготовитель и правообладатель фонограмм – лицензиар (приложение 1, п. 2).
        </p>
        <p>
          <strong>Защита.</strong> По обращениям РАО, ВОИС и иных лиц лицензиар ведёт юридическую защиту заведения и
          возмещает потери на условиях приложения 3 к договору: в заведении звучали только фонограммы каталога через плеер,
          доступ к заведению действует.
        </p>
        <p>
          <strong>Пределы.</strong> Сертификат подтверждает права только на фонограммы каталога, воспроизведённые через плеер
          в этом заведении. Он не распространяется на радио, телевидение, потребительские музыкальные сервисы, живые
          выступления и иную музыку и не является государственной регистрацией прав.
        </p>
        <p>
          <strong>Обращения.</strong> {BUSINESS_LEGAL_CONTACT.email}, телефон и МАКС {BUSINESS_LEGAL_CONTACT.phoneDisplay}.
          Отвечаем в течение {BUSINESS_LEGAL_RESPONSE_DAYS} рабочих дней.
        </p>
      </section>

      <footer className="venue-cert__check">
        <div className="venue-cert__qr">
          <PointQrCode value={checkUrl} size={132} label={`QR-код проверки сертификата № ${certificateDisplayNumber(number)}`} />
        </div>
        <div>
          <p className="venue-cert__check-title">Проверить подлинность</p>
          <p>Наведите камеру телефона на QR-код или откройте страницу:</p>
          <p className="venue-cert__url">audiolad.ru/b/coffee/legal/sertifikat/{number}</p>
          <p>
            Подпись и печать не требуются. Если данные на странице проверки и в распечатке различаются, верны данные
            страницы.
          </p>
        </div>
      </footer>
    </article>
  );
}
